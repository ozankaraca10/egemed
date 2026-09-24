import { describe, expect, it } from "vitest";
import { sessionIdForToken } from "../../apps/api/src/auth/session";
import {
  ADMIN_ID,
  ALI_ID,
  DERYA_ID,
  FIXED_NOW,
  MERT_ID,
  auditActions,
  createAdminHarness,
  login,
  type AdminHarness,
  type Login,
} from "./admin-harness";

// T66 (ek) — E3 §b `PUT /admin/users/:id/roles`: admin rolünün elle atanması,
// kilitlenme koruması (kendi admin rolünü kaldıramaz), oturum iptali ve audit.
// Bellek deposu; DB gerekmez.

async function putRoles(
  harness: AdminHarness,
  account: Login,
  id: string,
  body: Record<string, unknown>,
) {
  return harness.app.request(`/admin/users/${id}/roles`, {
    method: "PUT",
    headers: { ...account.headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /admin/users/:id/roles (E3 §b)", () => {
  it("admin rolünü elle atar, hedefin oturumlarını iptal eder ve audit yazar", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const admin = await login(harness, "ornek.yonetici");
    const response = await putRoles(harness, admin, ALI_ID, {
      roles: ["kullanici", "admin"],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: ALI_ID, displayName: "Ali Veli", roles: ["admin", "kullanici"], status: "active" },
    });
    expect(harness.adminStore.records.get(ALI_ID)?.roles).toEqual(["admin", "kullanici"]);
    expect(harness.adminStore.records.get(ALI_ID)?.updatedAt).toBe(FIXED_NOW);
    expect(harness.authStore.sessionRecords.get(sessionIdForToken(ali.token))?.revokedAt).toBe(
      FIXED_NOW,
    );
    expect(harness.authStore.auditEntries).toHaveLength(1);
    expect(harness.authStore.auditEntries[0]).toMatchObject({
      action: "user.roles_set",
      actorUserId: ADMIN_ID,
      actorRole: "admin",
      targetType: "user",
      targetId: ALI_ID,
      summaryBefore: { roles: "kullanici" },
      summaryAfter: { roles: "admin,kullanici" },
    });
  });

  it("başka adminin rolünü geri alabilir", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await putRoles(harness, admin, MERT_ID, { roles: ["kullanici"] });
    expect(response.status).toBe(200);
    expect((await response.json()).data.roles).toEqual(["kullanici"]);
    expect(harness.adminStore.records.get(MERT_ID)?.roles).toEqual(["kullanici"]);
    expect(auditActions(harness)).toEqual(["user.roles_set"]);
  });

  it("kendi admin rolünü kaldıramaz: 403 role_not_permitted", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await putRoles(harness, admin, ADMIN_ID, { roles: ["kullanici"] });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "role_not_permitted" } });
    expect(harness.adminStore.records.get(ADMIN_ID)?.roles).toEqual(["admin"]);
    expect(auditActions(harness)).toEqual([]);
  });

  it("kendi rollerine kullanici ekleyebilir (admin korunur)", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await putRoles(harness, admin, ADMIN_ID, {
      roles: ["admin", "kullanici"],
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.roles).toEqual(["admin", "kullanici"]);
  });

  it("boş rol kümesini 422 role_required ile reddeder", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await putRoles(harness, admin, ALI_ID, { roles: [] });
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "validation_failed", details: { issues: [{ code: "role_required" }] } },
    });
    expect(harness.adminStore.records.get(ALI_ID)?.roles).toEqual(["kullanici"]);
  });

  it("tekrarlı/bilinmeyen rol ve bilinmeyen alanı 400 ile reddeder", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    for (const body of [
      { roles: ["admin", "admin"] },
      { roles: ["denetci"] },
      { roles: ["kullanici"], scope: "kurum" },
    ]) {
      const response = await putRoles(harness, admin, ALI_ID, body);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
    }
    expect(auditActions(harness)).toEqual([]);
  });

  it("aynı rol kümesi değişiklik sayılmaz: audit yok, oturum iptali yok", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const admin = await login(harness, "ornek.yonetici");
    const response = await putRoles(harness, admin, ALI_ID, { roles: ["kullanici"] });
    expect(response.status).toBe(200);
    expect(auditActions(harness)).toEqual([]);
    expect(harness.authStore.sessionRecords.get(sessionIdForToken(ali.token))?.revokedAt).toBeNull();
  });

  it("kapsam dışı, silinmiş ve geçersiz kimlik 404 döner", async () => {
    const harness = createAdminHarness();
    const admin = await login(harness, "ornek.yonetici");
    expect((await putRoles(harness, admin, DERYA_ID, { roles: ["kullanici"] })).status).toBe(404);
    expect((await putRoles(harness, admin, "gecersiz-kimlik", { roles: ["kullanici"] })).status).toBe(
      404,
    );

    const deleted = await harness.app.request(`/admin/users/${ALI_ID}`, {
      method: "DELETE",
      headers: admin.headers,
    });
    expect(deleted.status).toBe(200);
    expect((await putRoles(harness, admin, ALI_ID, { roles: ["kullanici"] })).status).toBe(404);
  });

  it("kullanici rolü uca giremez: 403; CSRF olmadan mutasyon reddedilir", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const denied = await putRoles(harness, ali, ALI_ID, { roles: ["admin"] });
    expect(denied.status).toBe(403);

    const admin = await login(harness, "ornek.yonetici");
    const noCsrf = await harness.app.request(`/admin/users/${ALI_ID}/roles`, {
      method: "PUT",
      headers: { cookie: admin.headers.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({ roles: ["admin"] }),
    });
    expect(noCsrf.status).toBe(403);
    expect(harness.adminStore.records.get(ALI_ID)?.roles).toEqual(["kullanici"]);
    expect(harness.adminStore.records.get(ALI_ID)?.updatedAt).toBe(FIXED_NOW - 1000);
  });
});
