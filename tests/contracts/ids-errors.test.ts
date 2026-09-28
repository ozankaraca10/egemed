import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  AUTH_METHODS,
  ERROR_CODES_BY_STATUS,
  ERROR_CODE_LIST,
  ROLES,
  SIM_IDS,
  USER_STATUSES,
  errorResponseSchema,
  isAssignableRole,
  isAuthMethod,
  isErrorCode,
  isGamificationEligible,
  isRole,
  isSimId,
  isUserStatus,
  statusForErrorCode,
} from "../../packages/contracts/src/index";
import type { ErrorStatus, SimId } from "../../packages/contracts/src/index";
import { SIMULATOR_IDS } from "../../packages/sim-host/src/index";
import type { SimulatorId } from "../../packages/sim-host/src/index";

/** İki birlik tipinin birebir aynı olduğunu derleme zamanında doğrular. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const simIdTypesMatch: Equal<SimId, SimulatorId> = true;

describe("kimlik birlikleri", () => {
  it("SimId, sim-host SimulatorId ile aynıdır (tek kaynak drift koruması)", () => {
    expect(simIdTypesMatch).toBe(true);
    expect(SIM_IDS).toEqual(SIMULATOR_IDS);
  });

  it("kimlik korumaları birlik dışı değerleri reddeder", () => {
    for (const value of ["pulse", "ausculta", "opaca"]) expect(isSimId(value)).toBe(true);
    for (const value of ["kalp", "", null, 42, { id: "pulse" }]) expect(isSimId(value)).toBe(false);
    expect(ROLES).toEqual(["admin", "kullanici", "ogretim_uyesi", "uzmanlik_ogrencisi"]);
    expect(isRole("admin")).toBe(true);
    expect(isRole("uzmanlik_ogrencisi")).toBe(true);
    expect(isRole("egitmen")).toBe(false);
    expect(ASSIGNABLE_ROLES).toEqual(["kullanici", "ogretim_uyesi", "uzmanlik_ogrencisi"]);
    expect(isAssignableRole("kullanici")).toBe(true);
    expect(isAssignableRole("uzmanlik_ogrencisi")).toBe(true);
    expect(isAssignableRole("admin")).toBe(false);
    expect(AUTH_METHODS).toEqual(["sso", "dev"]);
    expect(isAuthMethod("dev")).toBe(true);
    expect(isAuthMethod("parola")).toBe(false);
    expect(USER_STATUSES).toEqual(["invited", "active", "suspended", "deleted"]);
    expect(isUserStatus("active")).toBe(true);
    expect(isUserStatus("silinmis")).toBe(false);
  });

  it("oyunlaştırma uygunluğu öğretim üyesi ve uzmanlık öğrencisini dışlar (T184/T219)", () => {
    expect(isGamificationEligible(["kullanici"])).toBe(true);
    expect(isGamificationEligible([])).toBe(true);
    expect(isGamificationEligible(["ogretim_uyesi"])).toBe(false);
    expect(isGamificationEligible(["uzmanlik_ogrencisi"])).toBe(false);
    expect(isGamificationEligible(["admin", "uzmanlik_ogrencisi"])).toBe(false);
  });
});

describe("hata kodu kataloğu (§d)", () => {
  it("kodu HTTP durumuna eşler", () => {
    expect(statusForErrorCode("invalid_request")).toBe(400);
    expect(statusForErrorCode("session_expired")).toBe(401);
    expect(statusForErrorCode("role_not_permitted")).toBe(403);
    expect(statusForErrorCode("not_found")).toBe(404);
    expect(statusForErrorCode("duplicate_mapping_key")).toBe(409);
    expect(statusForErrorCode("already_deleted")).toBe(409);
    expect(statusForErrorCode("import_validation_failed")).toBe(422);
    expect(statusForErrorCode("rate_limited")).toBe(429);
    expect(statusForErrorCode("internal_error")).toBe(500);
    expect(ERROR_CODE_LIST).toHaveLength(18);
  });

  it("ters indeks her durumun kodlarını tutarlı taşır", () => {
    const statuses: ErrorStatus[] = [400, 401, 403, 404, 409, 422, 429, 500];
    for (const status of statuses) {
      expect(ERROR_CODES_BY_STATUS[status].length).toBeGreaterThan(0);
      for (const code of ERROR_CODES_BY_STATUS[status]) {
        expect(statusForErrorCode(code), code).toBe(status);
      }
    }
    expect(ERROR_CODES_BY_STATUS[401]).toContain("auth_subject_mismatch");
    expect(ERROR_CODES_BY_STATUS[409]).toEqual([
      "duplicate_mapping_key",
      "conflict",
      "already_deleted",
    ]);
  });

  it("zarf yalnız kod taşır; kullanıcıya görünen metin ve bilinmeyen alan reddedilir", () => {
    expect(errorResponseSchema.safeParse({ error: { code: "not_found" } }).success).toBe(true);
    expect(
      errorResponseSchema.safeParse({ error: { code: "not_found", details: { field: "email" } } })
        .success,
    ).toBe(true);
    expect(
      errorResponseSchema.safeParse({ error: { code: "not_found", message: "Kayıt yok" } }).success,
    ).toBe(false);
    expect(errorResponseSchema.safeParse({ error: { code: "bilinmeyen" } }).success).toBe(false);
    expect(isErrorCode("rate_limited")).toBe(true);
    expect(isErrorCode("boom")).toBe(false);
  });
});
