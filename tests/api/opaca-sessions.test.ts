import { describe, expect, it } from "vitest";
import {
  opacaPublicCaseSchema,
  simSessionFinishResponseSchema,
  simSessionStartResponseSchema,
  type OpacaPublicCase,
  type SimTelemetry,
} from "../../packages/contracts/src/index";
import { opaca } from "../../packages/assessment-bank/src/index";
import { imageById, ZONES } from "../../packages/assessment-bank/src/opaca/data";
import { encodeOpacaSummary } from "../../packages/gami-catalogs/src/index";
import { ALI, ALI_ID, DEFAULT_USERS, FIXED_NOW, INSTITUTION_ID, createAdminHarness, login, type AdminHarness, type Login } from "./admin-harness";

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

  // --- T235: sunucu kodlu Opaca rozet özeti -----------------------------------

  const STEP_ORDER = ["A", "B", "C", "D", "E"];
  /**
   * Konu rozetleri eşiğe bağlıdır; rastgele örneklemde eşik garanti olmadığından
   * testler plevra vakalarını sabitler (sunucu akışı yine uçtan uca işler).
   */
  function pleuraCaseIds(): readonly string[] {
    return opaca
      .poolFor("assessment")
      .filter(
        (def) =>
          def.primaryFinding === "pneumothorax" &&
          def.questions.some((question) => question.type === "finding_identify") &&
          def.questions.some((question) => question.type === "localization"),
      )
      .slice(0, opaca.FOCUS_CASE_COUNT)
      .map((def) => def.id);
  }

  /** Test ayrıcalığı: oturumun rastgele seçilmiş vakalarını verilenlerle değiştirir. */
  function pinCases(h: AdminHarness, sessionId: string, caseIds: readonly string[]): void {
    const row = h.simSessions.rows.get(sessionId);
    if (row === undefined) throw new Error("oturum yok");
    row.state.cases.splice(
      0,
      row.state.cases.length,
      ...caseIds.map((caseId) => ({
        caseId,
        publicCase: null,
        keys: null,
        openedAt: null,
        answeredAt: null,
        answers: null,
        telemetry: null,
        hintedQuestions: [],
        heardTokens: [],
        timedOut: false,
        result: null,
      })),
    );
  }

  /** Hedef bulgunun uzman kutusunun merkezine lokalizasyon işareti. */
  function markFor(caseDef: opaca.CaseDef): string {
    const question = caseDef.questions.find((entry) => entry.type === "localization");
    const box = imageById(caseDef.imageId)?.annotations.find(
      (annotation) => annotation.finding === question?.targetFinding && annotation.source !== "report_nlp",
    );
    if (question === undefined || box === undefined) throw new Error("lokalizasyon kutusu yok");
    return `pt:${(box.x + box.w / 2).toFixed(4)},${(box.y + box.h / 2).toFixed(4)}`;
  }

  /** Tüm soruları doğru yanıtlar (lokalizasyon hedef kutunun merkezi). */
  function correctAnswers(h: AdminHarness, sessionId: string, index: number): Record<string, string[]> {
    const { caseDef, keys } = storedCase(h, sessionId, index);
    const answers: Record<string, string[]> = {};
    for (const question of caseDef.questions) {
      answers[question.id] =
        question.type === "localization"
          ? [markFor(caseDef)]
          : question.correct.map((optionId) => tokenOf(keys, question.id, optionId)).filter((token) => token.length > 0);
    }
    return answers;
  }

  /** ABCDE sırasında tüm zorunlu bölgeler yeterince incelenmiş telemetri. */
  function fullTelemetry(caseDef: opaca.CaseDef): SimTelemetry {
    const step = new Map(ZONES.map((zone) => [zone.id, STEP_ORDER.indexOf(zone.step)]));
    const order = [...caseDef.technique.requiredZones].sort((a, b) => (step.get(a) ?? 0) - (step.get(b) ?? 0));
    return {
      visits: Object.fromEntries(order.map((id) => [id, { dwellMs: 1500, listenMs: 0, visits: 1, firstOrder: 0 }])),
      order,
      headChanges: 0,
      headUse: { bell: 0, diaphragm: 0 },
      replayCount: 0,
    };
  }

  /** Oturumu baştan sona oynar; `correct` false ise boş yanıt gönderir. */
  async function playSession(
    h: AdminHarness,
    who: Login,
    mode: "practice" | "assessment",
    correct = true,
    caseIds?: readonly string[],
  ): Promise<void> {
    const session = await start(h, who, { mode });
    if (caseIds !== undefined) pinCases(h, session.sessionId, caseIds);
    const count = h.simSessions.rows.get(session.sessionId)?.state.cases.length ?? 0;
    expect(count).toBeGreaterThan(0);
    for (let index = 1; index <= count; index += 1) {
      await openCase(h, who, session.sessionId, index);
      const { caseDef } = storedCase(h, session.sessionId, index);
      const answers = correct ? correctAnswers(h, session.sessionId, index) : {};
      const response = await call(h, who, "POST", `${sessionPath(session.sessionId)}/cases/${index}/answer`, {
        answers,
        telemetry: fullTelemetry(caseDef),
      });
      expect(response.status).toBe(200);
    }
    const finish = await call(h, who, "POST", `${sessionPath(session.sessionId)}/finish`);
    expect(finish.status).toBe(200);
  }

  function opacaAttempts(h: AdminHarness) {
    return [...h.gamificationStore.attempts.values()]
      .filter((attempt) => attempt.simId === "opaca" && attempt.userId === ALI_ID)
      .sort((a, b) => a.attemptNo - b.attemptNo);
  }

  async function badgeKeys(h: AdminHarness, who: Login): Promise<readonly string[]> {
    const response = await h.app.request("/me/gamification/opaca", { headers: who.headers });
    expect(response.status).toBe(200);
    return ((await response.json()) as { data: { badges: readonly { key: string }[] } }).data.badges.map((badge) => badge.key);
  }

  it("topicCorrect sunucu sonuçlarından kodlanır; istemci sayı bildirmez", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    const caseIds = pleuraCaseIds();
    expect(caseIds).toHaveLength(opaca.FOCUS_CASE_COUNT);
    await playSession(h, ali, "assessment", true, caseIds);
    const [first] = opacaAttempts(h);
    expect(first?.summary["opaca.mode"]).toBe(1);
    expect(first?.summary["opaca.cases"]).toBe(opaca.FOCUS_CASE_COUNT);
    expect(first?.summary["opaca.t.pleura"]).toBe(opaca.FOCUS_CASE_COUNT);
    // Konu rozeti (pleura eşiği 5) sunucu oturumuyla kazanılır.
    expect(await badgeKeys(h, ali)).toContain("pleura");
    // İstemci gövdesi yalnız yanıt/telemetri taşır; boş yanıt konu kodu üretmez.
    await playSession(h, ali, "assessment", false, caseIds);
    const [, second] = opacaAttempts(h);
    expect(second?.summary["opaca.t.pleura"]).toBeUndefined();
  });

  it("değerlendirme rozetleri sunucu oturumundan kazanılır (lokalizasyon, ABCDE, kalite, yorum, süre, puan)", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    // İki oturum: 10 doğru lokalizasyon/film kalitesi/yorum ve 100 puan.
    const caseIds = pleuraCaseIds();
    await playSession(h, ali, "assessment", true, caseIds);
    await playSession(h, ali, "assessment", true, caseIds);
    const attempt = opacaAttempts(h)[1];
    expect(attempt?.summary["opaca.loc"]).toBe(opaca.FOCUS_CASE_COUNT);
    expect(attempt?.summary["opaca.quality"]).toBe(opaca.FOCUS_CASE_COUNT);
    expect(attempt?.summary["opaca.interp"]).toBe(opaca.FOCUS_CASE_COUNT);
    // ABCDE kodu oturum başına 0/1'dir (katalog kuralı); sistematik rozeti eşiği 1.
    expect(attempt?.summary["opaca.abcde"]).toBe(1);
    expect(attempt?.summary["opaca.score"]).toBe(100);
    const keys = await badgeKeys(h, ali);
    for (const key of ["first-step", "threshold", "perfect", "systematic", "fast-accurate", "sharp-eye-1", "film-quality", "interpreter"]) {
      expect(keys, key).toContain(key);
    }
  });

  it("uygulama oturumları ipucusuz ve vaka toplamı rozetlerini kazandırır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    for (let round = 0; round < 2; round += 1) {
      const session = await start(h, ali, { mode: "practice" });
      for (let index = 1; index <= 10; index += 1) {
        await openCase(h, ali, session.sessionId, index);
        await answerCase(h, ali, session.sessionId, index);
      }
      expect((await call(h, ali, "POST", `${sessionPath(session.sessionId)}/finish`)).status).toBe(200);
    }
    const attempt = opacaAttempts(h)[1];
    expect(attempt?.summary["opaca.mode"]).toBe(0);
    expect(attempt?.summary["opaca.cases"]).toBe(10);
    expect(attempt?.summary["opaca.hints"]).toBe(0);
    const keys = await badgeKeys(h, ali);
    expect(keys).toContain("no-hints");
    expect(keys).toContain("practice-grit");
  });

  /** Önceki oturumları tohumlar (rozet eşiğine kalan adımlar için). */
  async function seedAssessment(h: AdminHarness, attemptNo: number, finishedAt: number): Promise<void> {
    const summary = encodeOpacaSummary({
      mode: "assessment",
      finishedAt: new Date(finishedAt).toISOString(),
      score: 80,
      caseCount: 1,
      hintsUsed: 0,
      extra: { localizationHits: 0, abcdeComplete: 0, qualityCorrect: 0, interpretationCorrect: 0, fastPerfect: false },
    });
    const written = await h.gamificationStore.repo.writeAttempt({
      id: `20000000-0000-4000-8000-${String(attemptNo).padStart(12, "0")}`,
      userId: ALI_ID,
      simId: "opaca",
      attemptNo,
      startedAt: finishedAt - 3_600_000,
      finishedAt,
      score: 80,
      maxScore: 100,
      passed: true,
      summary,
      createdAt: finishedAt,
      institutionId: INSTITUTION_ID,
      mode: "assessment",
      caseCount: 1,
      hintsUsed: 0,
    });
    expect(written.kind).toBe("created");
  }

  it("maraton rozeti 50 değerlendirme oturumunda kazanılır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    for (let index = 0; index < 49; index += 1) await seedAssessment(h, index + 1, FIXED_NOW - 1_800_000);
    await playSession(h, ali, "assessment", false);
    expect(await badgeKeys(h, ali)).toContain("marathon");
  });

  it("seri rozetleri sunucunun oturum günlerinden hesaplanır", async () => {
    const h = harness();
    const ali = await login(h, "ali.veli");
    await seedAssessment(h, 1, FIXED_NOW - 2 * 86_400_000);
    await seedAssessment(h, 2, FIXED_NOW - 86_400_000);
    await playSession(h, ali, "assessment", false);
    const keys = await badgeKeys(h, ali);
    expect(keys).toContain("streak-3");
    expect(keys).not.toContain("streak-7");
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
