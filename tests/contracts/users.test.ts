import { describe, expect, it } from "vitest";
import {
  bulkQuerySchema,
  bulkRequestSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  userListQuerySchema,
} from "../../packages/contracts/src/index";

const UNIT = "00000000-0000-4000-8000-000000000020";
const OTHER_USER = "00000000-0000-4000-8000-000000000002";

const createBody = () => ({
  username: "ornek.ogrenci",
  email: "ornek.ogrenci@example.invalid",
  displayName: "Örnek Öğrenci",
  authMethod: "sso",
  role: "kullanici",
  unitId: UNIT,
  simAccess: ["pulse", "opaca"],
});

describe("POST /admin/users gövdesi", () => {
  it("geçerli sentetik gövdeyi kabul eder ve e-postayı normalleştirir", () => {
    const parsed = createUserRequestSchema.safeParse({
      ...createBody(),
      email: "  Ornek.Ogrenci@Example.INVALID ",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.email).toBe("ornek.ogrenci@example.invalid");
      expect(parsed.data.simAccess).toEqual(["pulse", "opaca"]);
    }
  });

  it("eşleme anahtarı kuralını uygular", () => {
    const missing = createUserRequestSchema.safeParse({
      ...createBody(),
      username: undefined,
      email: undefined,
    });
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((issue) => issue.message)).toContain("mapping_key_required");
    }
    expect(createUserRequestSchema.safeParse({ ...createBody(), username: "Ornek.Ogrenci" }).success).toBe(false);
    expect(createUserRequestSchema.safeParse({ ...createBody(), email: "ornek@invalid" }).success).toBe(false);
  });

  it("rol biçimsel olarak geçerlidir; admin kısıtı yetki katmanındadır (403)", () => {
    const parsed = createUserRequestSchema.safeParse({ ...createBody(), role: "admin" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.role).toBe("admin");
  });

  it("bilinmeyen alanı ve kısa görünen adı reddeder", () => {
    expect(createUserRequestSchema.safeParse({ ...createBody(), parola: "gizli" }).success).toBe(false);
    expect(createUserRequestSchema.safeParse({ ...createBody(), displayName: "A" }).success).toBe(false);
    expect(createUserRequestSchema.safeParse({ ...createBody(), simAccess: ["kalp"] }).success).toBe(false);
  });
});

describe("PATCH /admin/users/:id gövdesi", () => {
  it("görünen ad ve birim değişikliğini kabul eder", () => {
    expect(updateUserRequestSchema.safeParse({ displayName: "Örnek Öğrenci 2" }).success).toBe(true);
    expect(updateUserRequestSchema.safeParse({ unitId: null }).success).toBe(true);
    expect(updateUserRequestSchema.safeParse({ username: null }).success).toBe(true);
  });

  it("boş gövdeyi, iki anahtarı birlikte boşaltmayı ve sso_subject'i reddeder", () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
    const bothNull = updateUserRequestSchema.safeParse({ username: null, email: null });
    expect(bothNull.success).toBe(false);
    if (!bothNull.success) {
      expect(bothNull.error.issues.map((issue) => issue.message)).toContain("mapping_key_required");
    }
    expect(updateUserRequestSchema.safeParse({ sso_subject: "opak-kimlik" }).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ role: "admin" }).success).toBe(false);
  });
});

describe("GET /admin/users sorgu parametreleri", () => {
  it("pageSize sınırını uygular (en çok 100)", () => {
    expect(userListQuerySchema.safeParse({ pageSize: "100" }).success).toBe(true);
    expect(userListQuerySchema.safeParse({ pageSize: "101" }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ pageSize: "0" }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ pageSize: "abc" }).success).toBe(false);
  });

  it("sıralama ve filtre enum'larını doğrular", () => {
    const valid = userListQuerySchema.safeParse({
      q: "örnek",
      role: "kullanici",
      unitId: UNIT,
      status: "active",
      authMethod: "sso",
      sort: "lastLoginAt",
      order: "desc",
      page: "2",
      pageSize: "50",
    });
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.pageSize).toBe(50);
    expect(userListQuerySchema.safeParse({ sort: "email" }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ order: "artan" }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ status: "silinmis" }).success).toBe(false);
    expect(userListQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("POST /admin/users/bulk gövdesi", () => {
  const userIds = [UNIT, OTHER_USER];

  it("operation enum'unu ve değer tiplerini eşler", () => {
    const cases = [
      { operation: "assign_role", value: "kullanici" },
      { operation: "revoke_role", value: "kullanici" },
      { operation: "set_unit", value: null },
      { operation: "set_status", value: "suspended" },
      { operation: "grant_sim", value: "pulse" },
      { operation: "revoke_sim", value: "opaca" },
    ] as const;
    for (const item of cases) {
      expect(bulkRequestSchema.safeParse({ userIds, ...item }).success, item.operation).toBe(true);
    }
    expect(bulkRequestSchema.safeParse({ userIds, operation: "sil", value: "x" }).success).toBe(false);
    expect(bulkRequestSchema.safeParse({ userIds, operation: "grant_sim", value: "kalp" }).success).toBe(false);
    expect(bulkRequestSchema.safeParse({ userIds, operation: "set_status", value: "deleted" }).success).toBe(false);
    expect(bulkRequestSchema.safeParse({ userIds: [], operation: "set_status", value: "active" }).success).toBe(false);
  });

  it("dryRun sorgusunu yalnız true/false ile kabul eder", () => {
    expect(bulkQuerySchema.parse({ dryRun: "true" }).dryRun).toBe(true);
    expect(bulkQuerySchema.parse({ dryRun: "false" }).dryRun).toBe(false);
    expect(bulkQuerySchema.safeParse({ dryRun: "1" }).success).toBe(false);
  });
});
