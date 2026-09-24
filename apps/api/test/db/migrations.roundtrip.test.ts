import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

// T61 (E3 §h) — yerel PostgreSQL üzerinde up→down→up turu. Yalnız elle
// çalıştırılır: `pnpm --filter @egemed/api test:db` (DATABASE_URL gerekir);
// CI kapısına eklenmez. Bu dosya bilerek paket tsconfig'i dışındadır: `pg`
// tipleri onaylı bağımlılık listesinde yok (@types/pg eklenmez), bu yüzden
// typecheck kapsamına alınmaz.

const databaseUrl = process.env.DATABASE_URL ?? "";
const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));
const migrationsTable = "pgmigrations";
const expectedTables = [
  "institutions",
  "units",
  "users",
  "user_roles",
  "sim_access",
  "sessions",
  "import_batches",
  "import_rows",
  "audit_log",
  "gami_profiles",
  "gami_badges",
  "gami_attempts",
] as const;

const migrate = (direction: "up" | "down") =>
  runner({
    databaseUrl,
    dir: migrationsDir,
    direction,
    count: Infinity,
    migrationsTable,
    log: () => {},
  });

async function exists(client: Client, name: string): Promise<boolean> {
  const result = await client.query("select to_regclass($1) is not null as present", [name]);
  return result.rows[0]?.present === true;
}

/** append-only ihlalinin 'P0010' koduyla reddedildiğini doğrular (savepoint içinde çağrılır). */
async function expectAppendOnlyRejection(
  client: Client,
  sql: string,
  values: string[] = [],
): Promise<void> {
  try {
    await client.query(sql, values);
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    expect(code, sql).toBe("P0010");
    expect(message ?? "", sql).toContain("audit_log append-only");
    return;
  }
  throw new Error(`append-only ihlali reddedilmedi: ${sql}`);
}

if (databaseUrl === "") {
  describe("migration turu (yerel PostgreSQL)", () => {
    it.skip("DATABASE_URL tanımlı değil; yerel tur atlandı", () => {});
  });
} else {
  describe("migration turu (yerel PostgreSQL)", () => {
    it("up→down→up turunu tamamlar ve görünümü sentetik veriyle sorgular", async () => {
      const client = new Client({ connectionString: databaseUrl });
      await client.connect();
      try {
        // Önceki başarısız turdan kalan kayıtlar varsa geri al.
        if (await exists(client, migrationsTable)) {
          await migrate("down");
        }

        await migrate("up");
        for (const table of expectedTables) {
          expect(await exists(client, table), table).toBe(true);
        }
        expect(await exists(client, "gami_leaderboard")).toBe(true);

        // Sentetik veriyle liderlik sıralaması; işlem geri alınır, iz kalmaz.
        await client.query("begin");
        await client.query(
          "insert into institutions (id, code, name) values ('00000000-0000-4000-8000-000000000010', 'ornek-kurum', 'Örnek Kurum')",
        );
        await client.query(
          `insert into users (id, institution_id, username, display_name, auth_method, status, xapi_actor_id)
           values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010',
                   'ornek.ogrenci', 'Örnek Öğrenci', 'sso', 'active', 'ornek-ogrenci-0001')`,
        );
        await client.query(
          `insert into gami_profiles (user_id, sim_id, xp, level)
           values ('00000000-0000-4000-8000-000000000001', 'pulse', 120, 2)`,
        );
        const leaderboard = await client.query(
          "select xp, rank from gami_leaderboard where user_id = '00000000-0000-4000-8000-000000000001'",
        );
        expect(leaderboard.rows).toHaveLength(1);
        expect(Number(leaderboard.rows[0]?.xp)).toBe(120);
        expect(Number(leaderboard.rows[0]?.rank)).toBe(1);
        await client.query("rollback");

        // audit_log append-only: rol-bağımsız tetikleyici UPDATE/DELETE/TRUNCATE'yi reddeder.
        await client.query("begin");
        const audit = await client.query(
          "insert into audit_log (action) values ('review.append-only.test') returning id",
        );
        const auditId = String(audit.rows[0]?.id ?? "");
        expect(auditId).not.toBe("");

        await client.query("savepoint append_only_update");
        await expectAppendOnlyRejection(
          client,
          "update audit_log set action = 'degistirildi' where id = $1",
          [auditId],
        );
        await client.query("rollback to savepoint append_only_update");

        await client.query("savepoint append_only_delete");
        await expectAppendOnlyRejection(client, "delete from audit_log where id = $1", [auditId]);
        await client.query("rollback to savepoint append_only_delete");

        await client.query("savepoint append_only_truncate");
        await expectAppendOnlyRejection(client, "truncate audit_log");
        await client.query("rollback to savepoint append_only_truncate");

        await client.query("rollback");

        await migrate("down");
        for (const table of expectedTables) {
          expect(await exists(client, table), table).toBe(false);
        }
        expect(await exists(client, "gami_leaderboard")).toBe(false);

        await migrate("up");
        for (const table of expectedTables) {
          expect(await exists(client, table), table).toBe(true);
        }
      } finally {
        await client.end();
      }
    });
  });
}
