import { describe, expect, it } from "vitest";
import {
  pulsePublicCaseSchema,
  simSessionAnswerResponseSchema,
  simSessionFinishResponseSchema,
  simSessionStartResponseSchema,
  type PulsePublicCase,
} from "../../packages/contracts/src/index";
import { pulse } from "../../packages/assessment-bank/src/index";
import { createAdminHarness, login, type AdminHarness, type Login } from "./admin-harness";

// A3.2 (ADR-009): Pulse sunucu vaka oturumu — anahtarsız madde, jetonlu seçenekler,
// uygulamada anında / değerlendirmede sonda geri bildirim; ipucu, ses ve görüntü ucu yok.

const TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };

function harness(): AdminHarness {
  return createAdminHarness();
}

async function call(h: AdminHarness, who: Login, method: string, path: string, body?: unknown) {
  return h.app.request(path, {
    method,
    headers: { ...who.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionPath(sessionId: string): string {
  return `/me/sims/pulse/sessions/${sessionId}`;
}

async function start(h: AdminHarness, who: Login, body: { readonly mode: "practice" | "assessment"; readonly focusFinding?: string }) {
  const response = await call(h, who, "POST", "/me/sims/pulse/sessions", body);
  expect(response.status).toBe(201);
  return simSessionStartResponseSchema.parse(await response.json()).data;
}

async function openCase(h: AdminHarness, who: Login, sessionId: string, index: number): Promise<PulsePublicCase> {
  const response = await call(h, who, "GET", `${sessionPath(sessionId)}/cases/${index}`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly data: unknown };
  return pulsePublicCaseSchema.parse(body.data);
}

/** Sunucu durumundan açılmış maddenin anahtarlarını okur (test ayrıcalığı; istemci bilemez). */
function storedCase(h: AdminHarness, sessionId: string, index: number) {
  const item = h.simSessions.rows.get(sessionId)?.state.cases[index - 1];
  const caseDef = item === undefined ? undefined : pulse.caseById(item.caseId);
  if (item === undefined || caseDef === undefined || item.keys === null) throw new Error("açılmış Pulse maddesi yok");
  const keys = item.keys;
  if ("audio" in keys || "images" in keys) throw new Error("Pulse anahtarı bekleniyordu");
  return { item, caseDef, keys };
}

function tokenOf(keys: pulse.PulseCaseKeys, originalIndex: number): string {
  return Object.keys(keys.options).find((token) => keys.options[token] === originalIndex) ?? "";
}

async function check(h: AdminHarness, who: Login, sessionId: string, index: number, answer: readonly string[]) {
  const response = await call(h, who, "POST", `${sessionPath(sessionId)}/cases/${index}/check`, { questionId: pulse.QUESTION_ID, answer });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { correct: boolean; correctOptionIds: string[]; feedback: string } }).data;
}

async function answer(h: AdminHarness, who: Login, sessionId: string, index: number, answers: Record<string, string[]>) {
  return call(h, who, "POST", `${sessionPath(sessionId)}/cases/${index}/answer`, { answers, telemetry: TELEMETRY });
}

describe("Pulse sunucu vaka oturumu (A3.2)", () => {
  it("uygulama: anahtarsız madde; doğru şık, gerekçe, geri bildirim ve madde kimliği sızmaz", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, { mode: "practice" });
    expect(session).toMatchObject({ mode: "practice", caseCount: 10, perCaseLimitMs: null, totalLimitMs: null });
    // İleri atlama yok.
    expect((await call(h, ali, "GET", `${sessionPath(session.sessionId)}/cases/2`)).status).toBe(409);
    const first = await openCase(h, ali, session.sessionId, 1);
    expect(first).toMatchObject({ simId: "pulse", index: 1, label: "Vaka 1", section: "case" });
    expect(first.options).toHaveLength(5);
    expect(first.options.every((option) => /^[A-Za-z0-9_-]{8,64}$/.test(option.id))).toBe(true);
    const caseId = h.simSessions.rows.get(session.sessionId)?.state.cases[0]?.caseId ?? "";
    expect(caseId).toMatch(/^C\d{3}$/);
    const raw = JSON.stringify(first);
    expect(raw).not.toContain(caseId);
    expect(raw).not.toMatch(/"correct"|"explanations"|"feedback"/);
  });

  it("odaklı uygulama: EKG paterni kimliğiyle en fazla 5 madde, hepsi aynı paternde", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, { mode: "practice", focusFinding: "af" });
    const cases = h.simSessions.rows.get(session.sessionId)?.state.cases ?? [];
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.length).toBeLessThanOrEqual(5);
    for (const entry of cases) {
      expect(pulse.caseById(entry.caseId)?.mode).toBe("af");
    }
  });

  it("uygulamada kontrol: yanlışta şık gerekçesi, doğruda madde geri bildirimi; kontrol kilitlenir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, { mode: "practice" });
    await openCase(h, ali, session.sessionId, 1);
    const first = storedCase(h, session.sessionId, 1);
    const correctToken = tokenOf(first.keys, first.caseDef.correct);
    const wrongToken = Object.keys(first.keys.options).find((token) => token !== correctToken) ?? "";
    const wrongFeedback = await check(h, ali, session.sessionId, 1, [wrongToken]);
    expect(wrongFeedback.correct).toBe(false);
    expect(wrongFeedback.correctOptionIds).toEqual([correctToken]);
    expect(wrongFeedback.feedback).toBe(first.caseDef.explanations[first.keys.options[wrongToken] ?? 0]);
    // Kontrol edilen soru kilitlenir.
    expect((await call(h, ali, "POST", `${sessionPath(session.sessionId)}/cases/1/check`, { questionId: pulse.QUESTION_ID, answer: [correctToken] })).status).toBe(409);
    // Uygulama yanıtı sonucu döndürür; kontrol edilen yanlış yanıt geçerlidir (0).
    const answered = await answer(h, ali, session.sessionId, 1, {});
    expect(answered.status).toBe(200);
    const practice = simSessionAnswerResponseSchema.parse(await answered.json()).data;
    expect(practice).toMatchObject({ mode: "practice", result: { total: 0, mastery: false } });
    // İkinci maddede doğru yanıt madde geri bildirimini açar.
    await openCase(h, ali, session.sessionId, 2);
    const second = storedCase(h, session.sessionId, 2);
    const secondCorrect = tokenOf(second.keys, second.caseDef.correct);
    const rightFeedback = await check(h, ali, session.sessionId, 2, [secondCorrect]);
    expect(rightFeedback.correct).toBe(true);
    expect(rightFeedback.feedback).toBe(second.caseDef.feedback);
    expect((await answer(h, ali, session.sessionId, 2, {})).status).toBe(200);
    const finish = await call(h, ali, "POST", `${sessionPath(session.sessionId)}/finish`);
    expect(finish.status).toBe(200);
    const done = simSessionFinishResponseSchema.parse(await finish.json()).data;
    expect(done.cases).toHaveLength(2);
    expect(done.total).toBe(50);
    expect(done.passed).toBe(false);
    expect(done.attemptId).not.toBeNull();
  });

  it("değerlendirme: geri bildirim yalnız bitişte; 10 SimCaseResult ve 0..100 toplam", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, { mode: "assessment" });
    expect(session.perCaseLimitMs).toBeGreaterThan(0);
    expect(session.caseCount).toBe(10);
    const first = await openCase(h, ali, session.sessionId, 1);
    expect(first.section).toBe("quiz");
    expect(JSON.stringify(first)).not.toMatch(/"correct"|"feedback"/);
    for (let index = 1; index <= 10; index += 1) {
      await openCase(h, ali, session.sessionId, index);
      const { caseDef, keys } = storedCase(h, session.sessionId, index);
      const answered = await answer(h, ali, session.sessionId, index, { [pulse.QUESTION_ID]: [tokenOf(keys, caseDef.correct)] });
      expect(answered.status).toBe(200);
      const payload = simSessionAnswerResponseSchema.parse(await answered.json()).data;
      expect(payload).toEqual({ mode: "assessment", accepted: true });
      expect(JSON.stringify(payload)).not.toContain("feedback");
    }
    const finish = await call(h, ali, "POST", `${sessionPath(session.sessionId)}/finish`);
    expect(finish.status).toBe(200);
    const done = simSessionFinishResponseSchema.parse(await finish.json()).data;
    expect(done.cases).toHaveLength(10);
    expect(done.cases.every((entry) => entry.max === 100 && entry.title.startsWith("Sentetik değerlendirme"))).toBe(true);
    expect(done.total).toBeGreaterThanOrEqual(0);
    expect(done.total).toBeLessThanOrEqual(100);
    expect(done.total).toBe(100);
    expect(done.passed).toBe(true);
    expect(done.attemptId).not.toBeNull();
  });

  it("ipucu/ses/görüntü ucu Pulse'ta yok; başkasının oturumu 404; sim erişimi yoksa 403", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const mert = await login(h, "mert.ikinci");
    const session = await start(h, ali, { mode: "practice" });
    await openCase(h, ali, session.sessionId, 1);
    expect((await call(h, ali, "POST", `${sessionPath(session.sessionId)}/cases/1/hint`, { questionId: pulse.QUESTION_ID })).status).toBe(404);
    expect((await call(h, ali, "GET", `${sessionPath(session.sessionId)}/audio/tok_bilinmeyen0000`)).status).toBe(404);
    expect((await call(h, ali, "GET", `${sessionPath(session.sessionId)}/image/tok_bilinmeyen0000`)).status).toBe(404);
    // Başkasının oturumu varlığını da sızdırmaz.
    expect((await call(h, mert, "GET", `${sessionPath(session.sessionId)}/cases/1`)).status).toBe(404);
    expect((await call(h, mert, "POST", "/me/sims/pulse/sessions", { mode: "practice" })).status).toBe(403);
  });
});
