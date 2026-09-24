import { describe, expect, it } from "vitest";
import { createPgAdminBulkRepo } from "../../apps/api/src/admin/bulk";
import { sessionIdForToken } from "../../apps/api/src/auth/session";
import {
  ADMIN_ID,
  ALI_ID,
  BORA_ID,
  CEREN_ID,
  DERYA_ID,
  EGE_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  UNIT_ID,
  auditActions,
  createAdminHarness,
  login,
  type AdminHarness,
  type Login,
} from "./admin-harness";

// T66a — E3 §d `/admin/users/bulk`: dryRun önizlemesi, atomik uygulama, satır
// bazlı hatalar ve audit. Bellek deposu; DB gerekmez.

const UNKNOWN_UNIT_ID = "00000000-0000-4000-8000-0000000000ff";

async function bulk(
  harness: AdminHarness,
  admin: Login,
  body: Record<string, unknown>,
  query = "",
) {
  return harness.app.request(`/admin/users/bulk${query}`, {
    method: "POST",
    headers: { ...admin.headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /admin/users/bulk (E3 §d)", () => {
  it("dryRun yalnız önizleme döner; depo ve audit değişmez", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await bulk(
      harness,
      admin,
      { userIds: [EGE_ID, ALI_ID], operation: "assign_role", value: "kullanici" },
      "?dryRun=true",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { dryRun: true, updated: 1, skipped: [{ userId: ALI_ID, code: "no_change" }] },
    });
    expect(harness.adminStore.records.get(EGE_ID)?.roles).toEqual([]);
    expect(auditActions(harness)).toEqual([]);
  });

  it("uygulama dryRun sayılarını birebir üretir ve audit yazar", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await bulk(harness, admin, {
      userIds: [EGE_ID, ALI_ID],
      operation: "assign_role",
      value: "kullanici",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { dryRun: false, updated: 1, skipped: [{ userId: ALI_ID, code: "no_change" }] },
    });
    expect(harness.adminStore.records.get(EGE_ID)?.roles).toEqual(["kullanici"]);
    expect(harness.adminStore.records.get(EGE_ID)?.updatedAt).toBe(FIXED_NOW);
    expect(harness.authStore.auditEntries).toHaveLength(1);
    expect(harness.authStore.auditEntries[0]).toMatchObject({
      action: "user.bulk",
      actorUserId: ADMIN_ID,
      actorRole: "admin",
      institutionId: INSTITUTION_ID,
      targetType: "user",
      targetId: EGE_ID,
      summaryAfter: { operation: "assign_role", value: "kullanici" },
    });
  });

  it("geçersiz satır varsa hiçbir değişiklik yapılmaz (atomik)", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await bulk(harness, admin, {
      userIds: [ALI_ID, DERYA_ID],
      operation: "grant_sim",
      value: "opaca",
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_failed",
        details: { rows: [{ userId: DERYA_ID, code: "not_found" }] },
      },
    });
    expect(harness.adminStore.records.get(ALI_ID)?.simAccess).toEqual(["pulse"]);
    expect(auditActions(harness)).toEqual([]);
  });

  it("assign_role/revoke_role ile admin atanamaz: 403 role_not_permitted", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    for (const operation of ["assign_role", "revoke_role"]) {
      const response = await bulk(harness, admin, {
        userIds: [ALI_ID],
        operation,
        value: "admin",
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    }
    expect(harness.adminStore.records.get(ALI_ID)?.roles).toEqual(["kullanici"]);
    expect(auditActions(harness)).toEqual([]);
  });

  it("set_unit bilinmeyen birimi reddeder, null sınıflandırmayı temizler", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const unknown = await bulk(harness, admin, {
      userIds: [ALI_ID],
      operation: "set_unit",
      value: UNKNOWN_UNIT_ID,
    });
    expect(unknown.status).toBe(422);
    expect(await unknown.json()).toMatchObject({
      error: { code: "validation_failed", details: { issues: [{ code: "unknown_unit" }] } },
    });
    expect(harness.adminStore.records.get(ALI_ID)?.unitId).toBe(UNIT_ID);

    const cleared = await bulk(harness, admin, {
      userIds: [ALI_ID],
      operation: "set_unit",
      value: null,
    });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data).toEqual({ dryRun: false, updated: 1, skipped: [] });
    expect(harness.adminStore.records.get(ALI_ID)?.unitId).toBeNull();
  });

  it("set_status askıya alır, oturumları iptal eder; yineleme skip edilir", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const admin = await login(harness, "ornek.yonetici");
    const suspend = await bulk(harness, admin, {
      userIds: [ALI_ID],
      operation: "set_status",
      value: "suspended",
    });
    expect(suspend.status).toBe(200);
    expect(harness.adminStore.records.get(ALI_ID)?.status).toBe("suspended");
    expect(harness.authStore.sessionRecords.get(sessionIdForToken(ali.token))?.revokedAt).toBe(
      FIXED_NOW,
    );
    expect((await harness.app.request("/auth/me", { headers: ali.headers })).status).toBe(401);

    const again = await bulk(harness, admin, {
      userIds: [ALI_ID],
      operation: "set_status",
      value: "suspended",
    });
    expect((await again.json()).data).toEqual({
      dryRun: false,
      updated: 0,
      skipped: [{ userId: ALI_ID, code: "no_change" }],
    });
    expect(auditActions(harness)).toEqual(["user.bulk"]);
    expect(harness.authStore.sessionRecords.get(sessionIdForToken(admin.token))?.revokedAt).toBeNull();
  });

  it("rol değişikliği hedefin oturumlarını iptal eder (E3 §a)", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const admin = await login(harness, "ornek.yonetici");
    const response = await bulk(harness, admin, {
      userIds: [ALI_ID],
      operation: "revoke_role",
      value: "kullanici",
    });
    expect(response.status).toBe(200);
    expect(harness.adminStore.records.get(ALI_ID)?.roles).toEqual([]);
    expect(harness.authStore.sessionRecords.get(sessionIdForToken(ali.token))?.revokedAt).toBe(
      FIXED_NOW,
    );
    expect((await harness.app.request("/auth/me", { headers: ali.headers })).status).toBe(401);
  });

  it("sim erişimini verir/alır; yinelemede skip eder", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const revoked = await bulk(harness, admin, {
      userIds: [BORA_ID],
      operation: "revoke_sim",
      value: "opaca",
    });
    expect((await revoked.json()).data.updated).toBe(1);
    expect(harness.adminStore.records.get(BORA_ID)?.simAccess).toEqual([]);

    const granted = await bulk(harness, admin, {
      userIds: [BORA_ID, CEREN_ID],
      operation: "grant_sim",
      value: "pulse",
    });
    expect((await granted.json()).data).toEqual({ dryRun: false, updated: 2, skipped: [] });
    expect(harness.adminStore.records.get(BORA_ID)?.simAccess).toEqual(["pulse"]);
    expect(harness.adminStore.records.get(CEREN_ID)?.simAccess).toEqual(["pulse"]);

    const again = await bulk(harness, admin, {
      userIds: [BORA_ID],
      operation: "grant_sim",
      value: "pulse",
    });
    expect((await again.json()).data).toEqual({
      dryRun: false,
      updated: 0,
      skipped: [{ userId: BORA_ID, code: "no_change" }],
    });
  });

  it("kullanici rolü toplu işlem ucuna giremez: 403", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const response = await bulk(harness, ali, {
      userIds: [EGE_ID],
      operation: "assign_role",
      value: "kullanici",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
  });

  it("CSRF belirteci olmadan mutasyon reddedilir", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await harness.app.request("/admin/users/bulk", {
      method: "POST",
      headers: { cookie: admin.headers.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({ userIds: [EGE_ID], operation: "assign_role", value: "kullanici" }),
    });
    expect(response.status).toBe(403);
    expect(harness.adminStore.records.get(EGE_ID)?.roles).toEqual([]);
  });

  it("geçersiz gövde ve sorgu 400 invalid_request döner", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const badOperation = await bulk(harness, admin, {
      userIds: [ALI_ID],
      operation: "set_password",
      value: "x",
    });
    expect(badOperation.status).toBe(400);
    const badDryRun = await bulk(
      harness,
      admin,
      { userIds: [ALI_ID], operation: "grant_sim", value: "pulse" },
      "?dryRun=evet",
    );
    expect(badDryRun.status).toBe(400);
  });

  it("PostgreSQL deposu değerleri SQL metnine gömmez, parametre taşır", async () => {
    const calls: { readonly text: string; readonly params: readonly unknown[] }[] = [];
    const repo = createPgAdminBulkRepo({
      query(text, params) {
        calls.push({ text, params });
        return Promise.resolve({ rows: [{ user_id: ALI_ID }] });
      },
    });
    const changed = await repo.apply({
      institutionId: INSTITUTION_ID,
      actorUserId: ADMIN_ID,
      operation: "set_unit",
      value: UNIT_ID,
      userIds: [ALI_ID],
      at: FIXED_NOW,
    });
    expect(changed).toEqual([ALI_ID]);
    const call = calls[0];
    expect(call?.text).toContain("$1");
    expect(call?.text).not.toContain(ALI_ID);
    expect(call?.text).not.toContain(UNIT_ID);
    expect(call?.params.slice(0, 2)).toEqual([[ALI_ID], INSTITUTION_ID]);
  });
});
