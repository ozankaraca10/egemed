import { describe, expect, it } from "vitest";
import {
  opacaPublicCaseSchema,
  simSessionFinishResponseSchema,
  simSessionStartResponseSchema,
  type OpacaPublicCase,
} from "../../packages/contracts/src/index";
import { opaca } from "../../packages/assessment-bank/src/index";
import { ALI, ALI_ID, DEFAULT_USERS, createAdminHarness, login, type AdminHarness, type Login } from "./admin-harness";

// A2.2 (ADR-009): Opaca sunucu vaka oturumu + görüntü vekili uçtan uca — anahtarsız
// vaka, sıralı açılış, anında geri bildirim, opak görüntü jetonu, sunucu notlandırması.

const TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };
const IMAGE_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x01, 0x02, 0x03, 0x04]);
/** Lokalizasyon sorusu olan bir bulgu (oturum odaklı açılır). */
const MARK_FOCUS = "airspace_opacity";

function harness(): AdminHarness {
  const users = DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...ALI, simAccess: ["pulse", "ausculta", "opaca"] as const } : entry));
  return createAdminHarness({ users, readImage: () => Promise.resolve(IMAGE_BYTES) });
}

async function call(h: AdminHarness, who: Login, method: string, path: string, body?: unknown) {
  return h.app.request(path, {
    method,
    headers: { ...who.headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function sessionPath(sessionId: string): string {
  return `/me/sims/opaca/sessions/${sessionId}`;
}

async function start(h: AdminHarness, who: Login, body: { readonly mode: "practice" | "assessment"; readonly focusFinding?: string }) {
  const response = await call(h, who, "POST", "/me/sims/opaca/sessions", body);
  expect(response.status).toBe(201);
  return simSessionStartResponseSchema.parse(await response.json()).data;
}

async function openCase(h: AdminHarness, who: Login, sessionId: string, index: number): Promise<OpacaPublicCase> {
  const response = await call(h, who, "GET", `${sessionPath(sessionId)}/cases/${index}`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as { readonly data: unknown };
  return opacaPublicCaseSchema.parse(body.data);
}

/** Sunucu durumundan açılmış vakanın anahtarlarını okur (test ayrıcalığı; istemci bilemez). */
function storedCase(h: AdminHarness, sessionId: string, index: number) {
  const item = h.simSessions.rows.get(sessionId)?.state.cases[index - 1];
  const caseDef = item === undefined ? undefined : opaca.caseById(item.caseId);
  const keys = item?.keys;
  if (item === undefined || caseDef === undefined || keys === undefined || keys === null || !("images" in keys)) throw new Error("açılmış vaka yok");
  return { item, caseDef, keys };
}

function tokenOf(keys: opaca.OpacaCaseKeys, questionId: string, optionId: string): string {
  const map = keys.options[questionId] ?? {};
  return Object.keys(map).find((token) => map[token] === optionId) ?? "";
}

async function answerCase(h: AdminHarness, who: Login, sessionId: string, index: number) {
  const response = await call(h, who, "POST", `${sessionPath(sessionId)}/cases/${index}/answer`, { answers: {}, telemetry: TELEMETRY });
  expect(response.status).toBe(200);
  return response;
}

describe("Opaca sunucu vaka oturumu (A2.2)", () => {
  it("uygulama: anahtarsız vaka; tanı, başlık, bulgu ve görüntü yolu sızmaz", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, { mode: "practice" });
    expect(session).toMatchObject({ mode: "practice", caseCount: 10, perCaseLimitMs: null, totalLimitMs: null });
    // İleri atlama yok.
    expect((await call(h, ali, "GET", `${sessionPath(session.sessionId)}/cases/2`)).status).toBe(409);
    const first = await openCase(h, ali, session.sessionId, 1);
    expect(first.simId).toBe("opaca");
    expect(first.image.token).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    const raw = JSON.stringify(first);
    expect(raw).not.toMatch(/"title"|primaryFinding|runtimeUrl|feedbackCorrect|clinicalDiagnosis/);
  });

  it("görüntü vekili: yalnız açılmış vakanın jetonu; no-store + nosniff; sahiplik ve uydurma jeton 404", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const admin = await login(h, "ornek.yonetici");
    const session = await start(h, ali, { mode: "practice" });
    const first = await openCase(h, ali, session.sessionId, 1);
    const token = first.image.token;
    const image = await call(h, ali, "GET", `${sessionPath(session.sessionId)}/image/${token}`);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/webp");
    expect(image.headers.get("cache-control")).toBe("no-store");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(IMAGE_BYTES);
    // Uydurma jeton ve başka oturumun jetonu bu oturumda geçersiz.
    expect((await call(h, ali, "GET", `${sessionPath(session.sessionId)}/image/tok_bilinmeyen0000`)).status).toBe(404);
    const other = await start(h, ali, { mode: "practice" });
    const otherFirst = await openCase(h, ali, other.sessionId, 1);
    expect((await call(h, ali, "GET", `${sessionPath(session.sessionId)}/image/${otherFirst.image.token}`)).status).toBe(404);
    // Başkasının oturumunda jeton geçerli olsa da sahiplik 404 verir.
    expect((await call(h, admin, "GET", `${sessionPath(session.sessionId)}/image/${token}`)).status).toBe(404);
  });

  it("uygulamada soru kontrolü: yanlış/doğru seçenek ve lokalizasyonda `pt:` işareti kabul edilir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, { mode: "practice", focusFinding: MARK_FOCUS });
    const caseIds = h.simSessions.rows.get(session.sessionId)?.state.cases.map((entry) => entry.caseId) ?? [];
    expect(caseIds.length).toBeGreaterThan(0);
    let wrongDone = false;
    let correctDone = false;
    let markDone = false;
    for (let index = 1; index <= caseIds.length && !(wrongDone && correctDone && markDone); index += 1) {
      const publicCase = await openCase(h, ali, session.sessionId, index);
      const { caseDef, keys } = storedCase(h, session.sessionId, index);
      for (const question of caseDef.questions.filter((entry) => entry.type !== "localization" && entry.correct.length > 0)) {
        if (wrongDone && correctDone) break;
        const correctTokens = question.correct.map((optionId) => tokenOf(keys, question.id, optionId));
        const options = publicCase.questions.find((entry) => entry.id === question.id)?.options ?? [];
        if (!wrongDone) {
          const wrong = options.map((option) => option.id).find((option) => !correctTokens.includes(option));
          if (wrong === undefined) continue;
          const checked = await call(h, ali, "POST", `${sessionPath(session.sessionId)}/cases/${index}/check`, { questionId: question.id, answer: [wrong] });
          expect(checked.status).toBe(200);
          const feedback = ((await checked.json()) as { data: { correct: boolean; correctOptionIds: string[] } }).data;
          expect(feedback.correct).toBe(false);
          expect(feedback.correctOptionIds).toEqual(correctTokens);
          // Kontrol edilen soru kilitlenir.
          expect((await call(h, ali, "POST", `${sessionPath(session.sessionId)}/cases/${index}/check`, { questionId: question.id, answer: correctTokens })).status).toBe(409);
          wrongDone = true;
          continue;
        }
        if (!correctDone) {
          const checked = await call(h, ali, "POST", `${sessionPath(session.sessionId)}/cases/${index}/check`, { questionId: question.id, answer: correctTokens });
          expect(checked.status).toBe(200);
          expect(((await checked.json()) as { data: { correct: boolean } }).data.correct).toBe(true);
          correctDone = true;
        }
      }
      if (!markDone) {
        const mark = caseDef.questions.find((entry) => entry.type === "localization");
        if (mark !== undefined) {
          const checked = await call(h, ali, "POST", `${sessionPath(session.sessionId)}/cases/${index}/check`, { questionId: mark.id, answer: ["pt:0.5,0.5"] });
          expect(checked.status).toBe(200);
          expect(typeof ((await checked.json()) as { data: { correct: boolean } }).data.correct).toBe("boolean");
          markDone = true;
        }
      }
      await answerCase(h, ali, session.sessionId, index);
    }
    expect(wrongDone).toBe(true);
    expect(correctDone).toBe(true);
    expect(markDone).toBe(true);
  });

  it("değerlendirme: tüm vakalar yanıtlanır; bitiş SimCaseResult listesi ve 0..100 toplam verir", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const session = await start(h, ali, { mode: "assessment" });
    expect(session.perCaseLimitMs).toBeGreaterThan(0);
    const count = h.simSessions.rows.get(session.sessionId)?.state.cases.length ?? 0;
    expect(count).toBe(10);
    for (let index = 1; index <= count; index += 1) {
      await openCase(h, ali, session.sessionId, index);
      const answered = await answerCase(h, ali, session.sessionId, index);
      expect(await answered.json()).toEqual({ data: { mode: "assessment", accepted: true } });
    }
    const finish = await call(h, ali, "POST", `${sessionPath(session.sessionId)}/finish`);
    expect(finish.status).toBe(200);
    const done = simSessionFinishResponseSchema.parse(await finish.json()).data;
    expect(done.cases).toHaveLength(count);
    expect(done.total).toBeGreaterThanOrEqual(0);
    expect(done.total).toBeLessThanOrEqual(100);
    expect(done.cases.every((entry) => entry.max === 100)).toBe(true);
    expect(done.attemptId).not.toBeNull();
  });

  it("sim erişimi olmayan kullanıcı 403; Ausculta oturumunda görüntü ucu 404", async () => {
    const users = DEFAULT_USERS.map((entry) => (entry.id === ALI_ID ? { ...ALI, simAccess: ["ausculta"] as const } : entry));
    const h = createAdminHarness({ users });
    const ali = await login(h, "ali.veli");
    expect((await call(h, ali, "POST", "/me/sims/opaca/sessions", { mode: "practice" })).status).toBe(403);
    const ausculta = await call(h, ali, "POST", "/me/sims/ausculta/sessions", { mode: "practice" });
    expect(ausculta.status).toBe(201);
    const sessionId = simSessionStartResponseSchema.parse(await ausculta.json()).data.sessionId;
    expect((await call(h, ali, "GET", `/me/sims/ausculta/sessions/${sessionId}/image/tok_bilinmeyen0000`)).status).toBe(404);
  });
});
