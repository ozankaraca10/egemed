import { describe, expect, it } from "vitest";
import {
  simSessionAnswerResponseSchema,
  simSessionCaseResponseSchema,
  simSessionFinishResponseSchema,
  simSessionStartResponseSchema,
  type AuscultaPublicCase,
} from "../../packages/contracts/src/index";
import { ausculta } from "../../packages/assessment-bank/src/index";
import { ALI, ALI_ID, DEFAULT_USERS, createAdminHarness, login, type AdminHarness, type Login } from "./admin-harness";

// A1.3 (ADR-009): sunucu vaka oturumu uçtan uca — anahtarsız vaka, sıralı açılış,
// uygulamada anında / değerlendirmede sonda geri bildirim, süre sınırı, sahiplik,
// ses vekili (oturuma özel bayt), dinleme çapraz doğrulaması, sunucu denemesi.

const MINUTE = 60_000;
const TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };

function wav(samples: number[]): Uint8Array {
  const data = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(data.buffer);
  const ascii = (at: number, text: string) => [...text].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 4000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => view.setInt16(44 + i * 2, sample, true));
  return data;
}

const AUDIO = wav(Array.from({ length: 400 }, (_, i) => Math.round(Math.sin(i / 5) * 8000)));

function harness(roles: readonly ("kullanici" | "ogretim_uyesi")[] = ["kullanici"]): AdminHarness {
  const users = DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...ALI, simAccess: ["pulse", "ausculta"] as const, roles } : entry));
  return createAdminHarness({ users, readAudio: () => Promise.resolve(AUDIO) });
}

async function call(h: AdminHarness, who: Login, method: string, path: string, body?: unknown) {
  const response = await h.app.request(path, {
    method,
    headers: { ...who.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return response;
}

async function start(h: AdminHarness, who: Login, mode: "practice" | "assessment") {
  const response = await call(h, who, "POST", "/me/sims/ausculta/sessions", { mode });
  expect(response.status).toBe(201);
  return simSessionStartResponseSchema.parse(await response.json()).data;
}

async function openCase(h: AdminHarness, who: Login, sessionId: string, index: number): Promise<AuscultaPublicCase> {
  const response = await call(h, who, "GET", `/me/sims/ausculta/sessions/${sessionId}/cases/${index}`);
  expect(response.status).toBe(200);
  return simSessionCaseResponseSchema.parse(await response.json()).data;
}

/** Sunucu durumundan doğru jetonları okur (test ayrıcalığı; istemci bunu bilemez). */
function correctAnswers(h: AdminHarness, sessionId: string, index: number): Record<string, string[]> {
  const row = h.simSessions.rows.get(sessionId);
  const item = row?.state.cases[index - 1];
  const caseDef = item === undefined ? undefined : ausculta.caseById(item.caseId);
  if (item?.keys === null || item?.keys === undefined || caseDef === undefined) throw new Error("vaka yok");
  const keys = item.keys;
  return Object.fromEntries(
    caseDef.questions.map((q) => [q.id, q.correct.map((id) => Object.keys(keys.options[q.id] ?? {}).find((t) => keys.options[q.id]?.[t] === id) ?? "")]),
  );
}

describe("sunucu vaka oturumu (A1.3)", () => {
  it("uygulama: anahtarsız vaka, sıralı açılış, anında geri bildirim, sunucu denemesi", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, "practice");
    expect(session).toMatchObject({ mode: "practice", caseCount: 10, perCaseLimitMs: null });
    // İleri atlama yok.
    expect((await call(h, ali, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/cases/2`)).status).toBe(409);
    const first = await openCase(h, ali, session.sessionId, 1);
    const raw = JSON.stringify(first);
    expect(raw).not.toMatch(/"correct"|\.wav|acousticFinding|feedback/);
    const answer = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, {
      answers: correctAnswers(h, session.sessionId, 1),
      telemetry: TELEMETRY,
    });
    expect(answer.status).toBe(200);
    const body = simSessionAnswerResponseSchema.parse(await answer.json()).data;
    expect(body.mode).toBe("practice");
    if (body.mode === "practice") expect(body.result.questions.every((q) => q.correct)).toBe(true);
    // Tekrar yanıt yok.
    expect((await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, { answers: {}, telemetry: TELEMETRY })).status).toBe(409);
    const finish = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/finish`);
    expect(finish.status).toBe(200);
    const done = simSessionFinishResponseSchema.parse(await finish.json()).data;
    expect(done.cases).toHaveLength(1);
    expect(done.attemptId).not.toBeNull();
    expect(done.xpGained).toBeGreaterThan(0);
    // Deneme sunucuda yazıldı; özet Ausculta kodlarını taşır.
    const summary = await call(h, ali, "GET", "/me/gamification/ausculta");
    expect(summary.status).toBe(200);
    expect(((await summary.json()) as { data: { xp: number } }).data.xp).toBeGreaterThan(0);
    // Bitmiş oturum yeniden kullanılamaz.
    expect((await call(h, ali, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/cases/2`)).status).toBe(409);
  });

  it("sonuç yanıtları öğrenme kütüphanesi anahtarını taşır (T214)", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const response = await call(h, ali, "POST", "/me/sims/ausculta/sessions", { mode: "practice", focusFinding: "s3" });
    expect(response.status).toBe(201);
    const session = simSessionStartResponseSchema.parse(await response.json()).data;
    await openCase(h, ali, session.sessionId, 1);
    const answer = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, {
      answers: correctAnswers(h, session.sessionId, 1),
      telemetry: TELEMETRY,
    });
    expect(answer.status).toBe(200);
    const body = simSessionAnswerResponseSchema.parse(await answer.json()).data;
    if (body.mode !== "practice") throw new Error("uygulama yanıtı bekleniyordu");
    expect(body.result.libraryKey).toBe("heart.s3");
    const finish = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/finish`);
    const done = simSessionFinishResponseSchema.parse(await finish.json()).data;
    expect(done.cases[0]?.libraryKey).toBe("heart.s3");
  });

  it("değerlendirme: yanıtta geri bildirim yok, ipucu yasak, bitişte açılır; açılmayan vakalar sıfır sayılır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, "assessment");
    expect(session.perCaseLimitMs).toBeGreaterThan(0);
    const first = await openCase(h, ali, session.sessionId, 1);
    expect(first.questions.every((q) => !q.hintAvailable)).toBe(true);
    expect((await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/hint`, { questionId: first.questions[0]?.id })).status).toBe(403);
    const answer = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, {
      answers: correctAnswers(h, session.sessionId, 1),
      telemetry: TELEMETRY,
    });
    expect(await answer.json()).toEqual({ data: { mode: "assessment", accepted: true } });
    const done = simSessionFinishResponseSchema.parse(await (await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/finish`)).json()).data;
    expect(done.cases).toHaveLength(10);
    expect(done.cases[0]?.questions.every((q) => q.correct)).toBe(true);
    expect(done.cases.slice(1).every((c) => c.questions.every((q) => !q.correct))).toBe(true);
    expect(done.total).toBeLessThan(50);
  });

  it("değerlendirmede vaka süresi aşılırsa yanıt boş sayılır (422) ve oturum sürer", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, "assessment");
    await openCase(h, ali, session.sessionId, 1);
    h.advance(11 * MINUTE);
    const late = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, {
      answers: correctAnswers(h, session.sessionId, 1),
      telemetry: TELEMETRY,
    });
    expect(late.status).toBe(422);
    expect(await late.json()).toMatchObject({ error: { details: { issues: [{ code: "case_time_exceeded" }] } } });
    expect(h.simSessions.rows.get(session.sessionId)?.state.cases[0]?.result?.questions.every((q) => !q.correct)).toBe(true);
    await openCase(h, ali, session.sessionId, 2);
  });

  it("başkasının oturumu 404; yeni değerlendirme eskisini kapatır; sahte jeton puan getirmez", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const admin = await login(h, "ornek.yonetici");
    const session = await start(h, ali, "assessment");
    expect((await call(h, admin, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1`)).status).toBe(404);
    const first = await openCase(h, ali, session.sessionId, 1);
    const forged = Object.fromEntries(first.questions.map((q) => [q.id, ["a", "b"]]));
    expect((await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, { answers: forged, telemetry: TELEMETRY })).status).toBe(400);
    const second = await start(h, ali, "assessment");
    expect((await call(h, ali, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1`)).status).toBe(409);
    expect(second.sessionId).not.toBe(session.sessionId);
  });

  it("ses vekili: yalnız açılmış vakanın jetonu; her istekte farklı bayt, no-store; dinleme çapraz doğrulanır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, "practice");
    const first = await openCase(h, ali, session.sessionId, 1);
    const point = first.points[0];
    const token = point?.audio.diaphragm ?? point?.audio.bell;
    expect(token).toBeDefined();
    const a = await call(h, ali, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/audio/${token}`);
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toBe("audio/wav");
    expect(a.headers.get("cache-control")).toContain("no-store");
    const b = await call(h, ali, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/audio/${token}`);
    const bytesA = new Uint8Array(await a.arrayBuffer());
    const bytesB = new Uint8Array(await b.arrayBuffer());
    expect(bytesA.length).toBe(AUDIO.length);
    const same = (x: Uint8Array, y: Uint8Array) => x.length === y.length && x.every((value, i) => value === y[i]);
    expect(same(bytesA, AUDIO)).toBe(false);
    expect(same(bytesA, bytesB)).toBe(false);
    expect((await call(h, ali, "GET", `/me/sims/ausculta/sessions/${session.sessionId}/audio/tok_bilinmeyen0000`)).status).toBe(404);
    // Dinlenmemiş noktanın beyanı sıfırlanır: sunucu kaydı yalnız istenen jetonu bilir.
    const heard = h.simSessions.rows.get(session.sessionId)?.state.cases[0]?.heardTokens ?? [];
    expect(heard).toEqual([token]);
  });

  it("öğretim üyesi oturum kullanır ama deneme yazılmaz (attemptId null, XP 0)", async () => {
    const h = harness(["ogretim_uyesi"]);
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, "practice");
    await openCase(h, ali, session.sessionId, 1);
    await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, {
      answers: correctAnswers(h, session.sessionId, 1),
      telemetry: TELEMETRY,
    });
    const done = simSessionFinishResponseSchema.parse(await (await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/finish`)).json()).data;
    expect(done.attemptId).toBeNull();
    expect(done.xpGained).toBe(0);
  });

  it("uygulamada soru kontrolü anında geri bildirim verir ve yanıtı kilitler; değerlendirmede yasak", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, "practice");
    const first = await openCase(h, ali, session.sessionId, 1);
    const question = first.questions[0];
    if (question === undefined) throw new Error("soru yok");
    const correct = correctAnswers(h, session.sessionId, 1)[question.id] ?? [];
    const wrong = [question.options.find((o) => !correct.includes(o.id))?.id ?? ""];
    const check = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/check`, { questionId: question.id, answer: wrong });
    expect(check.status).toBe(200);
    const feedback = ((await check.json()) as { data: { correct: boolean; correctOptionIds: string[] } }).data;
    expect(feedback.correct).toBe(false);
    expect(feedback.correctOptionIds).toEqual(correct);
    expect((await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/check`, { questionId: question.id, answer: correct })).status).toBe(409);
    // Kontrolden sonra doğruya çevirmek puanı değiştirmez (kilitli yanıt).
    const answers = { ...correctAnswers(h, session.sessionId, 1), [question.id]: correct };
    const answer = await call(h, ali, "POST", `/me/sims/ausculta/sessions/${session.sessionId}/cases/1/answer`, { answers, telemetry: TELEMETRY });
    const result = ((await answer.json()) as { data: { result: { questions: { questionId: string; correct: boolean }[] } } }).data.result;
    expect(result.questions.find((q) => q.questionId === question.id)?.correct).toBe(false);
    const assess = await start(h, ali, "assessment");
    const aCase = await openCase(h, ali, assess.sessionId, 1);
    expect((await call(h, ali, "POST", `/me/sims/ausculta/sessions/${assess.sessionId}/cases/1/check`, { questionId: aCase.questions[0]?.id, answer: [aCase.questions[0]?.options[0]?.id] })).status).toBe(403);
  });

  it("sim erişimi yoksa 403; sunucu oturumu olmayan sim 404", async () => {
    const h = createAdminHarness({});
    const ali = await login(h, "ali.veli");
    expect((await call(h, ali, "POST", "/me/sims/ausculta/sessions", { mode: "practice" })).status).toBe(403);
    expect((await call(h, ali, "POST", "/me/sims/pulse/sessions", { mode: "practice" })).status).toBe(404);
  });
});
