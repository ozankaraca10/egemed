import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";

/**
 * T126 — gerçek PostgreSQL testleri için ortak kurulum. Her test dosyası kendi
 * geçici şemasını (`t126_*`) kurar, migration'ları o şemaya uygular ve sonunda
 * düşürür; public şema ile mevcut veriye dokunulmaz. Bu yüzden dosyalar paralel
 * koşabilir: node-pg-migrate'in tek danışma kilidi (`advisory lock`) paylaşılmaz
 * (`noLock`), izolasyon şema başınadır.
 *
 * `DATABASE_URL` tanımlı değilse test dosyaları `it.skip` ile açık mesajla
 * atlar (migrations.roundtrip.test.ts deseni); suite FAIL etmez. Bağlantı
 * dizesi hiçbir yere yazdırılmaz.
 */

export const databaseUrl = process.env.DATABASE_URL ?? "";

/** Sabit an: `Date.now()` yasak; testler enjekte edilen zamanla çalışır. */
export const FIXED_NOW = Date.parse("2026-09-24T12:00:00.000Z");
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const INSTITUTION_ID = "00000000-0000-4000-8000-000000000010";
export const OTHER_INSTITUTION_ID = "00000000-0000-4000-8000-000000000011";
export const ALI_ID = "00000000-0000-4000-8000-000000000001";
export const MERT_ID = "00000000-0000-4000-8000-000000000002";
export const BORA_ID = "00000000-0000-4000-8000-000000000003";
export const CAN_ID = "00000000-0000-4000-8000-000000000004";
export const DENIZ_ID = "00000000-0000-4000-8000-000000000005";
export const UNIT_ID = "00000000-0000-4000-8000-000000000020";

const migrationsDir = fileURLToPath(new URL("../../migrations", import.meta.url));

async function migrate(schema: string, direction: "up" | "down"): Promise<void> {
  await runner({
    databaseUrl,
    dir: migrationsDir,
    direction,
    count: Infinity,
    migrationsTable: "pgmigrations",
    schema,
    migrationsSchema: schema,
    createSchema: true,
    createMigrationsSchema: true,
    noLock: true,
    log: () => {},
  });
}

/** Geçici şemayı sıfırdan kurar, migration'ları uygular ve bağlı istemciyi döner. */
export async function connectToSchema(schema: string): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`drop schema if exists "${schema}" cascade`);
  await client.query(`create schema "${schema}"`);
  await client.query(`set search_path to "${schema}"`);
  await migrate(schema, "up");
  return client;
}

/** Şemayı düşürür ve bağlantıyı kapatır (artık bırakmaz). */
export async function closeSchema(client: Client, schema: string): Promise<void> {
  try {
    await client.query(`drop schema if exists "${schema}" cascade`);
  } finally {
    await client.end();
  }
}

export async function insertInstitution(
  client: Client,
  id = INSTITUTION_ID,
  code = "ornek-kurum",
  name = "Örnek Kurum",
): Promise<void> {
  await client.query("insert into institutions (id, code, name) values ($1, $2, $3)", [id, code, name]);
}

/**
 * Testler arası sıfırlama. `audit_log` bilerek dışarıdadır: append-only
 * tetikleyicisi TRUNCATE/DELETE'i reddeder (P0010) ve testler denetim kaydı
 * üretmez; diğer tablolar çocuktan ebeveyne silinir.
 */
export async function resetDatabase(client: Client): Promise<void> {
  await client.query(
    `delete from gami_badges;
     delete from gami_attempts;
     delete from gami_profiles;
     delete from import_rows;
     delete from import_batches;
     delete from sim_access;
     delete from user_roles;
     delete from sessions;
     delete from users;
     delete from units;
     delete from institutions;`,
  );
}

export async function insertUnit(
  client: Client,
  input: { readonly id?: string; readonly code: string; readonly name: string; readonly institutionId?: string },
): Promise<string> {
  const id = input.id ?? UNIT_ID;
  await client.query(
    "insert into units (id, institution_id, code, name) values ($1, $2, $3, $4)",
    [id, input.institutionId ?? INSTITUTION_ID, input.code, input.name],
  );
  return id;
}

interface SeedUser {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  /** ^[A-Za-z0-9._:-]{8,128}$ biçimine uyar; benzersizdir. */
  readonly actorId: string;
  readonly institutionId?: string;
  readonly unitId?: string | null;
  readonly status?: "invited" | "active" | "suspended" | "deleted";
  /** Yumuşak silme; `status = 'deleted'` ile birlikte verilir. */
  readonly deletedAtMs?: number;
  readonly leaderboardVisible?: boolean;
}

export async function insertUser(client: Client, user: SeedUser): Promise<void> {
  await client.query(
    `insert into users (id, institution_id, unit_id, username, display_name, auth_method, status, xapi_actor_id, deleted_at, leaderboard_visible)
     values ($1, $2, $3, $4, $5, 'dev', $6, $7, $8, $9)`,
    [
      user.id,
      user.institutionId ?? INSTITUTION_ID,
      user.unitId ?? null,
      user.username,
      user.displayName,
      user.status ?? "active",
      user.actorId,
      user.deletedAtMs === undefined ? null : new Date(user.deletedAtMs),
      user.leaderboardVisible ?? true,
    ],
  );
}

/** Test kimlikleri UUID biçiminde üretilir (`on conflict` idempotentliği için). */
export function uuidLike(suffix: number): string {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}
