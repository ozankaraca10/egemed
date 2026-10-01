import { describe, expect, it } from "vitest";
import { pulsePublicCaseSchema, simSessionStartResponseSchema } from "../../packages/contracts/src/index";
import { pulse } from "../../packages/assessment-bank/src/index";
import { buildFlagSignals } from "../../apps/api/src/integrity/signals";
import {
  ADMIN_USER,
  ALI_ID,
  FIXED_NOW,
  UNIT_ID,
  generatedId,
  user,
  createAdminHarness,
  login,
  type AdminHarness,
  type Login,
} from "./admin-harness";

/**
 * T283b — yönetici karar ucu (`POST /admin/integrity/:flagId/decision`) ve
 * rekabet engeli (`competition_bans`, ADR-009 §6). Otomatik ceza YOK: engel
 * yalnız `confirmed` kararıyla açılır, yalnız `lift` ile kapanır. Dört senaryo:
 * admin olmayan → 403, `pending` olmayan işaret → 409, `confirmed` → engel +
 * etkiler (Meydan Okuma, liderlik, `/me/gamification`, değerlendirme XP'si),
 * lift → etkiler kalkar. Sinyal/eşik hesapları `integrity-signals.test.ts` ve
 * tespit kablolaması `integrity-flagging.test.ts`'de test edildiği için burada
 * tekrar edilmez — yalnız karar ucu ve engelin aşağı akış etkileri test edilir.
 */

const TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };

// Ausculta erişimi (Meydan Okuma) de gerektiği için DEFAULT_USERS'taki ALI yerine
// her iki sime erişimi olan ayrı bir öğrenci tanımlanır (aynı kullanıcı adı/kimlik).
const STUDENT = user({
  id: ALI_ID,
  username: "ali.veli",
  displayName: "Ali Veli",
  authMethod: "dev",
  unitId: UNIT_ID,
  simAccess: ["pulse", "ausculta"],
});

const FLAG_ID = generatedId(9001);
const SESSION_ID = generatedId(9002);

function harness(): AdminHarness {
  const h = createAdminHarness({ users: [ADMIN_USER, STUDENT] });
  // Öğrenme kilidi (T290): bu dosya karar/engel akışını test eder, kilidi değil.
  h.learn.records.set(`${ALI_ID}:pulse`, { userId: ALI_ID, simId: "pulse", completedAt: FIXED_NOW, contentVersion: "test.1" });
  h.learn.records.set(`${ALI_ID}:ausculta`, { userId: ALI_ID, simId: "ausculta", completedAt: FIXED_NOW, contentVersion: "test.1" });
  return h;
}

async function writePendingFlag(h: AdminHarness): Promise<string> {
  await h.integrity.write({
    id: FLAG_ID,
    sessionId: SESSION_ID,
    userId: ALI_ID,
    simId: "pulse",
    mode: "assessment",
    score: 7,
    signals: buildFlagSignals([["too_fast"]], false),
    createdAt: FIXED_NOW,
  });
  return FLAG_ID;
}

async function call(h: AdminHarness, who: Login | undefined, method: string, path: string, body?: unknown) {
  return h.app.request(path, {
    method,
    headers: { ...(who?.headers ?? {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function truncateToOneCase(h: AdminHarness, sessionId: string): void {
  const row = h.simSessions.rows.get(sessionId);
  if (row === undefined) throw new Error("oturum yok");
  row.state.cases.splice(1, row.state.cases.length - 1);
}

function correctToken(h: AdminHarness, sessionId: string): string {
  const item = h.simSessions.rows.get(sessionId)?.state.cases[0];
  const caseDef = item === undefined ? undefined : pulse.caseById(item.caseId);
  const keys = item?.keys;
  if (item === undefined || caseDef === undefined || keys === null || keys === undefined || "audio" in keys || "images" in keys) {
    throw new Error("açılmış Pulse maddesi yok");
  }
  return Object.keys(keys.options).find((token) => keys.options[token] === caseDef.correct) ?? "";
}

/** Tek maddelik Pulse değerlendirmesi başlatır, doğru yanıtlar, bitirir; `xpGained` döner. */
async function runPulseAssessment(h: AdminHarness, who: Login): Promise<number> {
  const start = await call(h, who, "POST", "/me/sims/pulse/sessions", { mode: "assessment" });
  expect(start.status).toBe(201);
  const { sessionId } = simSessionStartResponseSchema.parse(await start.json()).data;
  truncateToOneCase(h, sessionId);
  const opened = await call(h, who, "GET", `/me/sims/pulse/sessions/${sessionId}/cases/1`);
  expect(opened.status).toBe(200);
  pulsePublicCaseSchema.parse(((await opened.json()) as { data: unknown }).data);
  const answer = await call(h, who, "POST", `/me/sims/pulse/sessions/${sessionId}/cases/1/answer`, {
    answers: { [pulse.QUESTION_ID]: [correctToken(h, sessionId)] },
    telemetry: TELEMETRY,
  });
  expect(answer.status).toBe(200);
  const finish = await call(h, who, "POST", `/me/sims/pulse/sessions/${sessionId}/finish`);
  expect(finish.status).toBe(200);
  return ((await finish.json()) as { data: { xpGained: number } }).data.xpGained;
}

async function isMeInLeaderboard(h: AdminHarness, who: Login): Promise<boolean> {
  const response = await call(h, who, "GET", "/me/gamification/pulse/leaderboard");
  const body = (await response.json()) as { data: { rows: { isMe: boolean }[] } };
  return body.data.rows.some((row) => row.isMe);
}

describe("T283b — POST /admin/integrity/:flagId/decision", () => {
  it("admin olmayan karar ucuna erişemez (403)", async () => {
    const h = harness();
    const flagId = await writePendingFlag(h);
    const student = await login(h, "ali.veli");
    const response = await call(h, student, "POST", `/admin/integrity/${flagId}/decision`, { decision: "cleared" });
    expect(response.status).toBe(403);
  });

  it("pending olmayan işarete ikinci kararda 409; bilinmeyen işarete 404", async () => {
    const h = harness();
    const flagId = await writePendingFlag(h);
    const admin = await login(h, "ornek.yonetici");
    expect((await call(h, admin, "POST", `/admin/integrity/${flagId}/decision`, { decision: "cleared" })).status).toBe(200);
    expect((await call(h, admin, "POST", `/admin/integrity/${flagId}/decision`, { decision: "cleared" })).status).toBe(409);
    expect((await call(h, admin, "POST", `/admin/integrity/${generatedId(9999)}/decision`, { decision: "cleared" })).status).toBe(404);
  });

  it("confirmed karar rekabet engeli açar: Meydan Okuma, liderlik, /me/gamification ve değerlendirme XP'si etkilenir", async () => {
    const h = harness();
    const flagId = await writePendingFlag(h);
    const admin = await login(h, "ornek.yonetici");
    const student = await login(h, "ali.veli");

    // Engelden ÖNCE: profil oluşur, liderlikte görünür, XP kazanır.
    expect(await runPulseAssessment(h, student)).toBeGreaterThan(0);
    expect(await isMeInLeaderboard(h, student)).toBe(true);

    const decision = await call(h, admin, "POST", `/admin/integrity/${flagId}/decision`, {
      decision: "confirmed",
      note: "İkinci oturumda da aynı desen görüldü; rekabetten men edildi.",
    });
    expect(decision.status).toBe(200);
    const decisionBody = (await decision.json()) as { data: { status: string; banned: boolean } };
    expect(decisionBody.data).toMatchObject({ status: "confirmed", banned: true });

    // GET /admin/integrity listesi kullanıcının aktif engelini taşır.
    const list = await call(h, admin, "GET", "/admin/integrity");
    const listRows = ((await list.json()) as { data: { userId: string; banned: boolean }[] }).data;
    expect(listRows.find((row) => row.userId === ALI_ID)?.banned).toBe(true);

    // Meydan Okuma oluşturma: 403 forbidden + competition_banned.
    const createChallenge = await call(h, student, "POST", "/me/challenges", { simId: "ausculta" });
    expect(createChallenge.status).toBe(403);
    const createBody = (await createChallenge.json()) as { error: { code: string; details?: { issues?: { code: string }[] } } };
    expect(createBody.error.code).toBe("forbidden");
    expect(createBody.error.details?.issues?.[0]?.code).toBe("competition_banned");

    // Liderlikte artık hiç görünmez.
    expect(await isMeInLeaderboard(h, student)).toBe(false);

    // /me/gamification yönetici kararını taşır.
    const summary = await call(h, student, "GET", "/me/gamification");
    expect(((await summary.json()) as { data: { competitionBanned: boolean } }).data.competitionBanned).toBe(true);

    // Yeni değerlendirme denemesi yazılır (öğrenme verisi korunur) ama XP 0.
    expect(await runPulseAssessment(h, student)).toBe(0);
  });

  it("lift sonrası etkiler kalkar; aktif engeli olmayan kullanıcıda 404", async () => {
    const h = harness();
    const flagId = await writePendingFlag(h);
    const admin = await login(h, "ornek.yonetici");
    const student = await login(h, "ali.veli");

    // Henüz engel yokken kaldırma 404.
    expect((await call(h, admin, "POST", `/admin/integrity/bans/${ALI_ID}/lift`)).status).toBe(404);

    expect((await call(h, admin, "POST", `/admin/integrity/${flagId}/decision`, { decision: "confirmed" })).status).toBe(200);
    expect(((await (await call(h, student, "GET", "/me/gamification")).json()) as { data: { competitionBanned: boolean } }).data.competitionBanned).toBe(
      true,
    );

    const lift = await call(h, admin, "POST", `/admin/integrity/bans/${ALI_ID}/lift`);
    expect(lift.status).toBe(200);
    expect(((await lift.json()) as { data: { banned: boolean } }).data).toEqual({ userId: ALI_ID, banned: false });

    // İkinci kaldırma artık aktif engel olmadığı için 404.
    expect((await call(h, admin, "POST", `/admin/integrity/bans/${ALI_ID}/lift`)).status).toBe(404);

    const summary = await call(h, student, "GET", "/me/gamification");
    expect(((await summary.json()) as { data: { competitionBanned: boolean } }).data.competitionBanned).toBe(false);

    // Yeni değerlendirme denemesi tekrar XP kazanır ve liderlikte görünür.
    expect(await runPulseAssessment(h, student)).toBeGreaterThan(0);
    expect(await isMeInLeaderboard(h, student)).toBe(true);
  });
});
