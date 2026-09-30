import { describe, expect, it } from "vitest";
import { toIstanbulIso } from "../../apps/api/src/admin/users";
import {
  ADMIN_ID,
  ALI_ID,
  BORA_ID,
  FIXED_NOW,
  INSTITUTION_ID,
  MERT_ID,
  OTHER_INSTITUTION_ID,
  createAdminHarness,
  login,
  type AdminHarness,
} from "./admin-harness";

// T67 — GET /admin/audit (E3 §d): yetki, kurum kapsamı, filtreler, sayfalama ve
// salt okunurluk. DB gerekmez; bellek deposu ve enjekte edilen sabit saat
// kullanılır. Gerçek öğrenci verisi yoktur; kayıtlar sentetiktir.

interface AuditSeed {
  readonly occurredAt: number;
  readonly actorUserId: string | null;
  readonly institutionId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly summaryAfter?: Readonly<Record<string, string>>;
}

async function seedAudit(harness: AdminHarness, entries: readonly AuditSeed[]): Promise<void> {
  for (const entry of entries) {
    await harness.authStore.repos.audit.insert({
      occurredAt: entry.occurredAt,
      actorUserId: entry.actorUserId,
      institutionId: entry.institutionId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      summaryAfter: entry.summaryAfter ?? { status: "ok" },
      requestId: "req-izleme-0001",
    });
  }
}

interface AuditRow {
  readonly id: string;
  readonly occurredAt: string;
  readonly actorUserId: string | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly summaryBefore: Record<string, string> | null;
  readonly summaryAfter: Record<string, string> | null;
  readonly requestId: string | null;
}

interface AuditResponse {
  readonly data: readonly AuditRow[];
  readonly meta: { readonly page: number; readonly pageSize: number; readonly total: number };
}

/** Program DOM tipleri içermez; yanıt yalnız kullanılan dar yüzeyle okunur. */
interface JsonResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

async function getAudit(
  harness: AdminHarness,
  headers: Record<string, string>,
  query = "",
): Promise<JsonResponse> {
  return harness.app.request(`/admin/audit${query}`, { headers });
}

const ADMIN_ENTRY: AuditSeed = {
  occurredAt: FIXED_NOW - 3000,
  actorUserId: ADMIN_ID,
  institutionId: INSTITUTION_ID,
  action: "user.create",
  targetType: "user",
  targetId: ALI_ID,
  summaryAfter: { status: "invited", roles: "kullanici" },
};

const SUSPEND_ENTRY: AuditSeed = {
  occurredAt: FIXED_NOW - 2000,
  actorUserId: ADMIN_ID,
  institutionId: INSTITUTION_ID,
  action: "user.suspend",
  targetType: "user",
  targetId: BORA_ID,
  summaryAfter: { status: "suspended" },
};

const MERT_ENTRY: AuditSeed = {
  occurredAt: FIXED_NOW - 1000,
  actorUserId: MERT_ID,
  institutionId: INSTITUTION_ID,
  action: "user.update",
  targetType: "user",
  targetId: ALI_ID,
  summaryAfter: { status: "active" },
};

describe("yetki (E3 §b kural 3-4)", () => {
  it("oturumsuz istek 401 unauthorized döner", async () => {
    const harness = createAdminHarness();
    const response = await getAudit(harness, {});
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("kullanici rolü 403 forbidden alır ve kayıt yazılmaz", async () => {
    const harness = createAdminHarness();
    const ali = await login(harness, "ali.veli");
    const response = await getAudit(harness, ali.headers);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "forbidden" } });
    expect(harness.authStore.auditEntries).toEqual([]);
  });
});

describe("kurum kapsamı", () => {
  it("yalnız aktörün kurumundaki kayıtları döner", async () => {
    const harness = createAdminHarness();
    await seedAudit(harness, [
      ADMIN_ENTRY,
      { ...ADMIN_ENTRY, institutionId: OTHER_INSTITUTION_ID, targetId: BORA_ID },
      { ...ADMIN_ENTRY, institutionId: null, actorUserId: null },
    ]);
    const admin = await login(harness, "ornek.yonetici");
    const response = await getAudit(harness, admin.headers);
    expect(response.status).toBe(200);
    const body = (await response.json()) as AuditResponse;
    expect(body.meta.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.targetId).toBe(ALI_ID);
  });
});

describe("filtreler (E3 §d)", () => {
  async function seededHarness(): Promise<AdminHarness> {
    const harness = createAdminHarness();
    await seedAudit(harness, [ADMIN_ENTRY, SUSPEND_ENTRY, MERT_ENTRY]);
    return harness;
  }

  async function filtered(query: string): Promise<AuditResponse> {
    const harness = await seededHarness();
    const admin = await login(harness, "ornek.yonetici");
    const response = await getAudit(harness, admin.headers, query);
    expect(response.status).toBe(200);
    return (await response.json()) as AuditResponse;
  }

  it("actorId, action, targetType ve targetId ile süzer", async () => {
    expect((await filtered(`?actorId=${ADMIN_ID}`)).meta.total).toBe(2);
    expect((await filtered("?action=user.suspend")).meta.total).toBe(1);
    expect((await filtered("?targetType=user&action=user.update")).meta.total).toBe(1);
    expect((await filtered(`?targetId=${ALI_ID}`)).meta.total).toBe(2);
    expect((await filtered(`?actorId=${BORA_ID}`)).meta.total).toBe(0);
  });

  it("from ve to sınırları kapsayıcıdır", async () => {
    const from = await filtered(`?from=${encodeURIComponent(toIstanbulIso(FIXED_NOW - 2000))}`);
    expect(from.data.map((row) => row.action)).toEqual(["user.update", "user.suspend"]);
    const to = await filtered(`?to=${encodeURIComponent(toIstanbulIso(FIXED_NOW - 2000))}`);
    expect(to.data.map((row) => row.action)).toEqual(["user.suspend", "user.create"]);
  });

  it("geçersiz filtreyi 400 invalid_request ile reddeder", async () => {
    for (const query of [
      "?actorId=kisa",
      "?targetId=kisa",
      "?from=dun",
      "?action=USER.CREATE",
      "?pageSize=1000",
      "?page=0",
    ]) {
      const harness = await seededHarness();
      const admin = await login(harness, "ornek.yonetici");
      const response = await getAudit(harness, admin.headers, query);
      expect(response.status, query).toBe(400);
      expect(await response.json(), query).toMatchObject({ error: { code: "invalid_request" } });
    }
  });
});

describe("sayfalama ve biçim", () => {
  it("en yeni kayıt önce gelir; meta toplamı taşır", async () => {
    const harness = createAdminHarness();
    const entries = Array.from({ length: 25 }, (_, index) => ({
      ...ADMIN_ENTRY,
      occurredAt: FIXED_NOW - index * 1000,
      action: `olay.${index}`,
    }));
    await seedAudit(harness, entries);
    const admin = await login(harness, "ornek.yonetici");

    const first = (await (
      await getAudit(harness, admin.headers, "?page=1&pageSize=10")
    ).json()) as AuditResponse;
    expect(first.meta).toEqual({ page: 1, pageSize: 10, total: 25 });
    expect(first.data).toHaveLength(10);
    expect(first.data[0]?.action).toBe("olay.0");
    expect(first.data[9]?.action).toBe("olay.9");

    const third = (await (
      await getAudit(harness, admin.headers, "?page=3&pageSize=10")
    ).json()) as AuditResponse;
    expect(third.data).toHaveLength(5);
    expect(third.data[4]?.action).toBe("olay.24");
  });

  it("satır yalnız kodlu özet taşır; kurum kimliği ve sır dönmez", async () => {
    const harness = createAdminHarness();
    await seedAudit(harness, [ADMIN_ENTRY]);
    const admin = await login(harness, "ornek.yonetici");
    const body = (await (await getAudit(harness, admin.headers)).json()) as AuditResponse;
    const row = body.data[0] as AuditRow & { readonly institutionId?: unknown };
    expect(row.id).toBe("1");
    expect(row.occurredAt).toBe(toIstanbulIso(ADMIN_ENTRY.occurredAt));
    expect(row.actorUserId).toBe(ADMIN_ID);
    expect(row.action).toBe("user.create");
    expect(row.targetType).toBe("user");
    expect(row.targetId).toBe(ALI_ID);
    expect(row.summaryBefore).toBeNull();
    expect(row.summaryAfter).toEqual({ status: "invited", roles: "kullanici" });
    expect(row.requestId).toBe("req-izleme-0001");
    expect(row.institutionId).toBeUndefined();
    expect(Object.keys(row).sort()).toEqual([
      "action",
      "actorName",
      "actorRole",
      "actorUserId",
      "id",
      "occurredAt",
      "requestId",
      "summaryAfter",
      "summaryBefore",
      "targetId",
      "targetName",
      "targetType",
    ]);
  });
});

describe("salt okunurluk", () => {
  it("mutasyon yöntemleri 404 döner ve günlük değişmez", async () => {
    const harness = createAdminHarness();
    await seedAudit(harness, [ADMIN_ENTRY]);
    const admin = await login(harness, "ornek.yonetici");
    for (const method of ["POST", "PATCH", "DELETE"]) {
      const init: { method: string; headers: Record<string, string>; body?: string } = {
        method,
        headers: { ...admin.headers, "content-type": "application/json" },
      };
      if (method !== "DELETE") init.body = JSON.stringify({});
      const response = await harness.app.request("/admin/audit", init);
      expect(response.status, method).toBe(404);
      expect(await response.json(), method).toMatchObject({ error: { code: "not_found" } });
    }
    expect(harness.authStore.auditEntries).toHaveLength(1);
  });
});
