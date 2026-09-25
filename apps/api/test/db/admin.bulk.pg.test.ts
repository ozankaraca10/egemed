import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { createPgAdminBulkRepo } from "../../src/admin/bulk";
import {
  ALI_ID,
  CAN_ID,
  DENIZ_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  MERT_ID,
  OTHER_INSTITUTION_ID,
  UNIT_ID,
  closeSchema,
  connectToSchema,
  databaseUrl,
  insertInstitution,
  insertUnit,
  insertUser,
  resetDatabase,
  uuidLike,
} from "./db-harness";

// T126 — `/admin/users/bulk` SQL'inin (API-07) gerçek PostgreSQL'de dönen
// kullanıcı kimlikleri: `set_status`/`set_unit` yalnız gerçekten değişen
// satırları döndürmeli; kurum, yumuşak silme ve aynı değer kapsam dışıdır.
// Geçici şema kurulur/silinir; DATABASE_URL yoksa açık mesajla atlanır.

const SCHEMA = "t126_admin_bulk";
const ACTOR_ID = uuidLike(900);

let client: Client;

function repo() {
  return createPgAdminBulkRepo(client);
}

async function apply(operation: "set_status" | "set_unit", value: string | null, userIds: readonly string[]) {
  return repo().apply({
    institutionId: INSTITUTION_ID,
    actorUserId: ACTOR_ID,
    operation,
    value,
    userIds,
    at: FIXED_NOW,
  });
}

async function fieldOf(userId: string, field: "status" | "unit_id"): Promise<string | null> {
  const result = await client.query(`select ${field}::text as value from users where id = $1`, [userId]);
  return (result.rows[0] as { readonly value: string | null } | undefined)?.value ?? null;
}

if (databaseUrl === "") {
  describe("toplu işlem kimlikleri (yerel PostgreSQL)", () => {
    it.skip("DATABASE_URL tanımlı değil; DB turu atlandı", () => {});
  });
} else {
  describe("toplu işlem kimlikleri (yerel PostgreSQL)", () => {
    beforeAll(async () => {
      client = await connectToSchema(SCHEMA);
    });

    afterAll(async () => {
      await closeSchema(client, SCHEMA);
    });

    beforeEach(async () => {
      await resetDatabase(client);
      await insertInstitution(client);
      await insertInstitution(client, OTHER_INSTITUTION_ID, "diger-kurum", "Diğer Kurum");
      await insertUnit(client, { code: "1-sinif", name: "1. Sınıf" });
      await insertUser(client, { id: ALI_ID, username: "ali.veli", displayName: "Ali Veli", actorId: "ali.veli-0001" });
      await insertUser(client, {
        id: MERT_ID,
        username: "mert.ikinci",
        displayName: "Mert İkinci",
        actorId: "mert.ikinci-0002",
        unitId: UNIT_ID,
      });
      await insertUser(client, {
        id: CAN_ID,
        username: "can.diger",
        displayName: "Can Diğer",
        actorId: "can.diger-0004",
        institutionId: OTHER_INSTITUTION_ID,
      });
      await insertUser(client, {
        id: DENIZ_ID,
        username: "deniz.silinmis",
        displayName: "Deniz Silinmiş",
        actorId: "deniz.silinmis-0005",
        status: "deleted",
        deletedAtMs: FIXED_NOW,
      });
    });

    it("set_status yalnız gerçekten değişen kullanıcı kimliklerini döner", async () => {
      const changed = await apply("set_status", "suspended", [ALI_ID, MERT_ID, CAN_ID, DENIZ_ID]);
      expect([...changed].sort()).toEqual([ALI_ID, MERT_ID]);
      expect(await fieldOf(ALI_ID, "status")).toBe("suspended");
      expect(await fieldOf(MERT_ID, "status")).toBe("suspended");
      expect(await fieldOf(CAN_ID, "status")).toBe("active");
      expect(await fieldOf(DENIZ_ID, "status")).toBe("deleted");

      // Aynı değer ikinci kez değişiklik üretmez.
      expect(await apply("set_status", "suspended", [ALI_ID, MERT_ID])).toEqual([]);
    });

    it("set_unit yalnız birimi değişenleri döner; aynı değer ve kapsam dışı atlanır", async () => {
      const changed = await apply("set_unit", UNIT_ID, [ALI_ID, MERT_ID, CAN_ID, DENIZ_ID]);
      expect([...changed]).toEqual([ALI_ID]);
      expect(await fieldOf(ALI_ID, "unit_id")).toBe(UNIT_ID);
      expect(await fieldOf(MERT_ID, "unit_id")).toBe(UNIT_ID);
      expect(await fieldOf(CAN_ID, "unit_id")).toBeNull();
      expect(await fieldOf(DENIZ_ID, "unit_id")).toBeNull();

      expect(await apply("set_unit", UNIT_ID, [ALI_ID, MERT_ID])).toEqual([]);

      // Birim temizleme (null) geçerli bir değişikliktir ve her iki kullanıcıyı döner.
      const cleared = await apply("set_unit", null, [ALI_ID, MERT_ID]);
      expect([...cleared].sort()).toEqual([ALI_ID, MERT_ID]);
      expect(await fieldOf(ALI_ID, "unit_id")).toBeNull();
      expect(await fieldOf(MERT_ID, "unit_id")).toBeNull();
    });
  });
}
