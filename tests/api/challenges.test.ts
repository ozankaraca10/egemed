import { describe, expect, it } from "vitest";
import {
  challengeListResponseSchema,
  challengeResponseSchema,
  simSessionCaseResponseSchema,
  simSessionFinishResponseSchema,
  simSessionStartResponseSchema,
} from "../../packages/contracts/src/index";
import { ausculta } from "../../packages/assessment-bank/src/index";
import { ADMIN_USER, ALI, DEFAULT_USERS, FIXED_NOW, INSTITUTION_ID, OTHER_INSTITUTION_ID, createAdminHarness, login, user, type AdminHarness, type Login } from "./admin-harness";

// Meydan Okuma (ADR-010) API: davet kodu, katılım kuralları, aynı vakalar ve
// aynı seçenek sırası, puan gizliliği, kazanan, düello XP'si ve liderlik dışı.

const TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };
const MINUTE = 60_000;

const ZEYNEP = user({ id: "00000000-0000-4000-8000-000000000031", username: "zeynep.a", displayName: "Zeynep A", authMethod: "dev", simAccess: ["ausculta"] });
const HOCA = user({ id: "00000000-0000-4000-8000-000000000032", username: "hoca.b", displayName: "Hoca B", authMethod: "dev", roles: ["ogretim_uyesi"], simAccess: ["ausculta"] });
const UZAK = user({ id: "00000000-0000-4000-8000-000000000033", username: "uzak.c", displayName: "Uzak C", authMethod: "dev", institutionId: OTHER_INSTITUTION_ID, simAccess: ["ausculta"] });

function harness(): AdminHarness {
  const users = [...DEFAULT_USERS.map((entry) => (entry.id === ALI.id ? { ...ALI, simAccess: ["ausculta"] as const } : entry)), ZEYNEP, HOCA, UZAK];
  const h = createAdminHarness({ users });
  // Öğrenme kilidi (27 Eyl 2026): düello testleri davranış kilidini ölçmez;
  // kurulumda ilgili kullanıcılar için Ausculta tamamlama kaydı eklenir.
  for (const userId of [ALI.id, ZEYNEP.id]) {
    h.learn.records.set(`${userId}:ausculta`, { userId, simId: "ausculta", completedAt: FIXED_NOW, contentVersion: "test.1" });
  }
  return h;
}

async function call(h: AdminHarness, who: Login, method: string, path: string, body?: unknown) {
  return h.app.request(path, {
    method,
    headers: { ...who.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function create(h: AdminHarness, who: Login) {
  const response = await call(h, who, "POST", "/me/challenges", { simId: "ausculta" });
  expect(response.status).toBe(201);
  return challengeResponseSchema.parse(await response.json()).data;
}

function correctFor(h: AdminHarness, sessionId: string, index: number): Record<string, string[]> {
  const item = h.simSessions.rows.get(sessionId)?.state.cases[index - 1];
  const caseDef = item === undefined ? undefined : ausculta.caseById(item.caseId);
  if (item?.keys === null || item?.keys === undefined || caseDef === undefined) throw new Error("vaka yok");
  const keys = item.keys;
  return Object.fromEntries(caseDef.questions.map((q) => [q.id, q.correct.map((id) => Object.keys(keys.options[q.id] ?? {}).find((t) => keys.options[q.id]?.[t] === id) ?? "")]));
}

/** Oturumu açar, ilk `correctCount` vakayı doğru, kalanını boş yanıtlar ve bitirir. */
async function play(h: AdminHarness, who: Login, challengeId: string, correctCount: number, stepMs = 5_000) {
  const response = await call(h, who, "POST", `/me/challenges/${challengeId}/session`);
  expect(response.status).toBe(201);
  const session = simSessionStartResponseSchema.parse(await response.json()).data;
  expect(session).toMatchObject({ mode: "challenge", perCaseLimitMs: 2 * MINUTE, totalLimitMs: 8 * MINUTE });
  const opened = [];
  for (let index = 1; index <= session.caseCount; index += 1) {
    const caseResponse = await call(h, who, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/cases/${index}`);
    const publicCase = simSessionCaseResponseSchema.parse(await caseResponse.json()).data;
    opened.push(publicCase);
    h.advance(stepMs);
    const answers = index <= correctCount ? correctFor(h, session.sessionId, index) : {};
    const answer = await call(h, who, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/${index}/answer`, { answers, telemetry: TELEMETRY });
    expect(await answer.json()).toEqual({ data: { mode: "challenge", accepted: true } });
  }
  const finish = simSessionFinishResponseSchema.parse(await (await call(h, who, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/finish`)).json()).data;
  return { session, opened, finish };
}

describe("Meydan Okuma (ADR-010)", () => {
  it("davet, katılım, aynı vakalar/seçenek sırası, puan gizliliği ve kazanan", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const zeynep = await login(h, "zeynep.a");
    const invite = await create(h, ali);
    expect(invite.code).toMatch(/^[0-9]{6}$/);
    expect(invite.status).toBe("open");
    // Kod düz metin saklanmaz.
    expect(JSON.stringify([...h.challenges.records.values()])).not.toContain(`"${invite.code}"`);

    const joined = await call(h, zeynep, "POST", "/me/challenges/join", { code: invite.code });
    expect(joined.status).toBe(200);
    const accepted = challengeResponseSchema.parse(await joined.json()).data;
    expect(accepted).toMatchObject({ status: "accepted", code: null });
    expect(accepted.participants.map((p) => p.displayName)).toEqual(["Ali Veli", "Zeynep A"]);

    const aliRun = await play(h, ali, invite.challengeId, 8);
    // Rakip bitirmeden puanlar gizli.
    const mid = challengeResponseSchema.parse(await (await call(h, ali, "GET", `/me/challenges/${invite.challengeId}`)).json()).data;
    expect(mid.participants.every((p) => p.score === null)).toBe(true);
    expect(mid.winner).toBeNull();

    const zeynepRun = await play(h, zeynep, invite.challengeId, 5);
    // İki tarafa aynı vakalar, aynı sırayla ve aynı seçenek SIRASIYLA (etiketler) verilir; jetonlar farklıdır.
    const labels = (run: typeof aliRun) => run.opened.map((c) => c.questions.map((q) => q.options.map((o) => o.label).join("|")).join("#"));
    expect(labels(zeynepRun)).toEqual(labels(aliRun));
    expect(zeynepRun.opened[0]?.questions[0]?.options[0]?.id).not.toBe(aliRun.opened[0]?.questions[0]?.options[0]?.id);

    const done = challengeResponseSchema.parse(await (await call(h, zeynep, "GET", `/me/challenges/${invite.challengeId}`)).json()).data;
    expect(done.status).toBe("finished");
    expect(done.winner).toBe("inviter");
    expect(done.participants.every((p) => p.score !== null && p.finished)).toBe(true);
    expect(h.challenges.records.get(invite.challengeId)?.status).toBe("finished");
    // Düello XP'si yazıldı ama liderliğe girmez.
    expect(aliRun.finish.xpGained).toBeGreaterThan(0);
    const board = await call(h, ali, "GET", "/me/gamification/ausculta/leaderboard?period=month&cohort=all");
    const rows = ((await board.json()) as { data: { rows: { isMe: boolean; attemptsCount: number }[] } }).data.rows;
    expect(rows.find((row) => row.isMe)?.attemptsCount ?? 0).toBe(0);
    // Liste her iki tarafa da görünür.
    const list = challengeListResponseSchema.parse(await (await call(h, zeynep, "GET", "/me/challenges")).json()).data;
    expect(list.map((c) => c.challengeId)).toContain(invite.challengeId);
  });

  it("kurallar: öğretim üyesi katılamaz/oluşturamaz, kendi davetine katılamaz, başka kurum bulamaz, tek rakip", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const zeynep = await login(h, "zeynep.a");
    const hoca = await login(h, "hoca.b");
    const uzak = await login(h, "uzak.c");
    const invite = await create(h, ali);
    expect((await call(h, hoca, "POST", "/me/challenges", { simId: "ausculta" })).status).toBe(403);
    expect((await call(h, hoca, "POST", "/me/challenges/join", { code: invite.code })).status).toBe(403);
    expect((await call(h, ali, "POST", "/me/challenges/join", { code: invite.code })).status).toBe(409);
    expect((await call(h, uzak, "POST", "/me/challenges/join", { code: invite.code })).status).toBe(404);
    expect((await call(h, zeynep, "POST", "/me/challenges/join", { code: invite.code })).status).toBe(200);
    // Kod artık açık değil.
    const admin = await login(h, ADMIN_USER.username ?? "");
    expect((await call(h, admin, "POST", "/me/challenges/join", { code: invite.code })).status).toBe(404);
    // Taraf olmayan düelloyu göremez.
    expect((await call(h, admin, "GET", `/me/challenges/${invite.challengeId}`)).status).toBe(404);
    expect(INSTITUTION_ID).not.toBe(OTHER_INSTITUTION_ID);
  });

  it("rakip kabul etmeden oynayamaz; kişi başı tek oturum; en fazla 3 açık davet; davet 24 saatte düşer", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const zeynep = await login(h, "zeynep.a");
    const invite = await create(h, ali);
    expect((await call(h, zeynep, "POST", `/me/challenges/${invite.challengeId}/session`)).status).toBe(404);
    // Davet eden hemen oynayabilir (eşzamansız); ikinci çağrı aynı oturumu döner.
    const first = await call(h, ali, "POST", `/me/challenges/${invite.challengeId}/session`);
    const again = await call(h, ali, "POST", `/me/challenges/${invite.challengeId}/session`);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    await create(h, ali);
    await create(h, ali);
    const fourth = await call(h, ali, "POST", "/me/challenges", { simId: "ausculta" });
    expect(fourth.status).toBe(409);
    h.advance(25 * 60 * MINUTE);
    const fresh = await login(h, "zeynep.a");
    expect((await call(h, fresh, "POST", "/me/challenges/join", { code: invite.code })).status).toBe(404);
  });

  it("düello süresi: vaka 2 dk aşılırsa yanıt boş sayılır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const invite = await create(h, ali);
    const session = simSessionStartResponseSchema.parse(await (await call(h, ali, "POST", `/me/challenges/${invite.challengeId}/session`)).json()).data;
    await call(h, ali, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1`);
    h.advance(3 * MINUTE);
    const late = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, {
      answers: correctFor(h, session.sessionId, 1),
      telemetry: TELEMETRY,
    });
    expect(late.status).toBe(422);
  });
});
