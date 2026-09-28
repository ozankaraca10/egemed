import { describe, expect, it } from "vitest";
import type { AuscultaPublicCase, SimCaseResult } from "../../packages/contracts/src/index";
import type { SimSessionSource } from "../../packages/sim-host/src/index";
import { initialState, reducer, type Action, type AppState } from "../../packages/sim-ausculta/src/core/reducer";
import {
  SERVER_HINT_PLACEHOLDER,
  SESSION_AUDIO_PREFIX,
  fromServerResult,
  serverPointIds,
  serverSoundRecord,
  toClientCase,
} from "../../packages/sim-ausculta/src/core/serverSession";
import {
  checkServerQuestion,
  finishServerSession,
  requestServerHint,
  serverErrorMessage,
  startServerSession,
  submitServerCase,
} from "../../packages/sim-ausculta/src/core/serverDriver";
import { resolveAuscultaAssetUrl } from "../../packages/sim-ausculta/src/SimModule";

// A1.4 (ADR-009): Ausculta istemcisi sunucu oturumuyla çalışır — uyarlayıcılar,
// sürücü adımları ve reducer; yerel oyunlaştırma olayı (`case_completed`) yayınlanmaz.

const PUBLIC_CASE: AuscultaPublicCase = {
  simId: "ausculta",
  index: 1,
  label: "Vaka 1",
  patient: { age: 6, sex: "kadın" },
  population: "pediatrik",
  chiefComplaint: "Öksürük",
  history: "Üç gündür öksürük.",
  vitalSigns: { hr: 110 },
  tasks: ["Uygun bölgeleri dinleyin."],
  views: ["front"],
  allowedHeads: ["bell", "diaphragm"],
  points: [
    { pointId: "cardiac_aortic", audio: { bell: "tok_audio00001", diaphragm: "tok_audio00001" } },
    { pointId: "lung_right_upper_anterior", audio: { diaphragm: "tok_audio00002" } },
  ],
  questions: [
    {
      id: "q1",
      type: "sound_identify",
      domain: "recognition",
      prompt: "Duyduğunuz ses?",
      multiple: false,
      hintAvailable: true,
      options: [
        { id: "tok_optionaaaa", label: "Normal" },
        { id: "tok_optionbbbb", label: "S3" },
      ],
    },
  ],
  technique: { minPointsVisited: 2 },
  openedAt: "2026-09-27T10:00:00.000+03:00",
};

const RESULT: SimCaseResult = {
  index: 1,
  title: "Normal Kardiyak Oskültasyon",
  diagnosis: null,
  summary: "Özet",
  total: 90,
  max: 100,
  mastery: true,
  domains: { recognition: { earned: 25, max: 25 }, technique: { earned: 15, max: 20 } },
  hintsUsed: 0,
  libraryKey: "heart.normal",
  questions: [{ questionId: "q1", correct: true, correctOptionIds: ["tok_optionaaaa"], feedback: "Doğru." }],
};

function fakeSessions(mode: "practice" | "assessment", overrides: Partial<SimSessionSource> = {}) {
  const calls: string[] = [];
  const source: SimSessionSource = {
    start: async (m, options) => {
      calls.push(`start:${m}:${options?.focusFinding ?? ""}`);
      return { sessionId: "00000000-0000-4000-8000-00000000abcd", mode, caseCount: 2, perCaseLimitMs: null, totalLimitMs: null, startedAt: "2026-09-27T10:00:00.000+03:00" };
    },
    getCase: async (_id, index) => {
      calls.push(`case:${index}`);
      return { ...PUBLIC_CASE, index };
    },
    hint: async (_id, _index, qid) => {
      calls.push(`hint:${qid}`);
      return { hint: "Ritmi sayın.", hintsUsed: 1 };
    },
    check: async (_id, _index, qid, answer) => {
      calls.push(`check:${qid}:${answer.join(",")}`);
      return { questionId: qid, correct: answer[0] === "tok_optionaaaa", correctOptionIds: ["tok_optionaaaa"], feedback: "Açıklama" };
    },
    answer: async (_id, index) => {
      calls.push(`answer:${index}`);
      return mode === "practice" ? { mode: "practice", result: RESULT } : { mode: "assessment", accepted: true };
    },
    finish: async () => {
      calls.push("finish");
      return { mode, total: 90, max: 100, passed: true, cases: [RESULT], xpGained: 50 };
    },
    audioUrl: (id, token) => `/api/me/sims/ausculta/sessions/${id}/audio/${token}`,
    imageUrl: (id, token) => `/api/me/sims/ausculta/sessions/${id}/image/${token}`,
    startChallenge: async (challengeId) => {
      calls.push(`challenge:${challengeId}`);
      return { sessionId: "00000000-0000-4000-8000-00000000cdef", mode: "challenge", caseCount: 2, perCaseLimitMs: 120000, totalLimitMs: 480000, startedAt: "2026-09-27T10:00:00.000+03:00" };
    },
    ...overrides,
  };
  return { source, calls };
}

function runner(start: AppState) {
  let state = start;
  const emitted: string[] = [];
  const dispatch = (action: Action) => {
    state = reducer(state, action, { emit: (event) => emitted.push(event.type) });
  };
  return { dispatch, get state() { return state; }, emitted };
}

describe("uyarlayıcılar", () => {
  it("anahtarsız vaka ekran biçimine çevrilir; doğru/geri bildirim/ses dosyası yoktur", () => {
    const clientCase = toClientCase(PUBLIC_CASE, "practice");
    expect(clientCase.id).toBe("srv-1");
    expect(clientCase.title).toBe("Vaka 1");
    expect(clientCase.questions[0]?.correct).toEqual([]);
    expect(clientCase.questions[0]?.hint).toBe(SERVER_HINT_PLACEHOLDER);
    expect(clientCase.soundAssignments).toEqual([]);
    expect(clientCase.population).toBe("pediatrik");
    expect(serverPointIds(clientCase)).toEqual(["cardiac_aortic", "lung_right_upper_anterior"]);
    expect(JSON.stringify(clientCase)).not.toMatch(/\.wav|acousticFinding":"[a-z]/);
  });

  it("karma posterior noktası bileşen bilgisini istemci vakasına taşır (T230)", () => {
    const componentCase: AuscultaPublicCase = {
      ...PUBLIC_CASE,
      points: [{ pointId: "lung_right_lower_posterior", audio: { diaphragm: "tok_audio00003" }, component: "lung" }],
    };
    const clientCase = toClientCase(componentCase, "practice");
    expect(clientCase.serverComponents).toEqual({ lung_right_lower_posterior: "lung" });
    expect(serverPointIds(clientCase)).toEqual(["lung_right_lower_posterior"]);
    expect(toClientCase(PUBLIC_CASE, "practice").serverComponents).toEqual({});
  });

  it("sunucu ses kaydı oturum adresini işaretler; varlık tabanı eklenmez", () => {
    const record = serverSoundRecord("cardiac_aortic", "tok_audio00001", "/api/me/sims/ausculta/sessions/s/audio/tok_audio00001");
    expect(record.runtimeUrl.startsWith(SESSION_AUDIO_PREFIX)).toBe(true);
    expect(resolveAuscultaAssetUrl("/sims/ausculta/", record.runtimeUrl)).toBe("/api/me/sims/ausculta/sessions/s/audio/tok_audio00001");
    expect(resolveAuscultaAssetUrl("/sims/ausculta/", "assets/audio/x.wav")).toBe("/sims/ausculta/assets/audio/x.wav");
  });

  it("sunucu sonucu ekran sonucuna ve başlık/tanı/özet bilgisine çevrilir", () => {
    const { result, meta } = fromServerResult(RESULT);
    expect(result).toMatchObject({ caseId: "srv-1", total: 90, mastery: true });
    expect(result.domains.recognition).toEqual({ earned: 25, max: 25 });
    expect(result.domains.diagnosis).toEqual({ earned: 0, max: 0 });
    expect(meta).toMatchObject({ title: "Normal Kardiyak Oskültasyon", diagnosis: null, summary: "Özet", libraryKey: "heart.normal" });
    expect(meta.questions?.q1).toEqual({ correctOptionIds: ["tok_optionaaaa"], feedback: "Doğru." });
  });
});

describe("sürücü + reducer", () => {
  it("uygulama: başlat → vaka → kontrol → ipucu → gönder → bitir; case_completed yayınlanmaz", async () => {
    const { source, calls } = fakeSessions("practice");
    const run = runner(reducer(initialState, { type: "startMode", mode: "practice", focusFinding: "s3" }));
    expect(run.state.serverFocus).toBe("s3");
    await startServerSession(source, run.dispatch, "practice", run.state.serverFocus);
    expect(run.state.server?.status).toBe("ready");
    expect(run.state.server?.currentCase?.id).toBe("srv-1");
    expect(run.state.currentCaseId).toBe("srv-1");
    const correct = await checkServerQuestion(source, run.dispatch, "s", 1, "q1", ["tok_optionbbbb"]);
    expect(correct).toBe(false);
    expect(run.state.server?.feedback.q1).toMatchObject({ correct: false, correctOptionIds: ["tok_optionaaaa"] });
    await requestServerHint(source, run.dispatch, "s", 1, "q1");
    expect(run.state.server?.hints.q1).toBe("Ritmi sayın.");
    await submitServerCase(source, run.dispatch, "s", 1, { q1: ["tok_optionbbbb"] }, initialState.telemetry);
    expect(run.state.pendingSummary?.total).toBe(90);
    expect(run.state.server?.metas["srv-1"]?.title).toBe("Normal Kardiyak Oskültasyon");
    await finishServerSession(source, run.dispatch, "s");
    expect(run.state.screen).toBe("results");
    expect(run.state.caseResults).toHaveLength(1);
    // T214: kütüphane anahtarı meta ile sonuç ekranına taşınır (odağın kaynağı).
    expect(run.state.server?.metas["srv-1"]?.libraryKey).toBe("heart.normal");
    expect(run.emitted).not.toContain("case_completed");
    expect(calls).toEqual(["start:practice:s3", "case:1", "check:q1:tok_optionbbbb", "hint:q1", "answer:1", "finish"]);
  });

  it("çok sorulu sunucu vakasında advance sonraki soruya geçer", async () => {
    const twoQuestions = { ...PUBLIC_CASE, questions: [...PUBLIC_CASE.questions, { ...PUBLIC_CASE.questions[0]!, id: "q2" }] };
    const { source } = fakeSessions("practice", { getCase: async () => twoQuestions });
    const run = runner(reducer(initialState, { type: "startMode", mode: "practice" }));
    await startServerSession(source, run.dispatch, "practice", null);
    expect(run.state.step).toBe(0);
    run.dispatch({ type: "advance" });
    expect(run.state.step).toBe(1);
  });

  it("değerlendirme: gönderimde sonuç yer tutucudur; geri bildirim bitişte gelir", async () => {
    const { source } = fakeSessions("assessment");
    const run = runner(reducer(initialState, { type: "startMode", mode: "assessment" }));
    await startServerSession(source, run.dispatch, "assessment", null);
    await submitServerCase(source, run.dispatch, "s", 1, {}, initialState.telemetry);
    expect(run.state.pendingSummary).toMatchObject({ caseId: "srv-1", total: 0 });
    expect(run.state.server?.metas["srv-1"]).toBeUndefined();
    await finishServerSession(source, run.dispatch, "s");
    expect(run.state.caseResults[0]?.total).toBe(90);
  });

  it("vaka süresi aşımı oturumu durdurmaz; diğer hatalar Türkçe iletiyle hata durumuna geçer", async () => {
    const timeout = fakeSessions("assessment", { answer: async () => Promise.reject(new Error("validation_failed case_time_exceeded")) });
    const run = runner(reducer(initialState, { type: "startMode", mode: "assessment" }));
    await startServerSession(timeout.source, run.dispatch, "assessment", null);
    await submitServerCase(timeout.source, run.dispatch, "s", 1, {}, initialState.telemetry);
    expect(run.state.server?.status).toBe("ready");
    expect(run.state.pendingSummary).not.toBeNull();
    const down = fakeSessions("practice", { start: async () => Promise.reject(new Error("network")) });
    const failing = runner(reducer(initialState, { type: "startMode", mode: "practice" }));
    await startServerSession(down.source, failing.dispatch, "practice", null);
    expect(failing.state.server).toBeNull();
    expect(serverErrorMessage(new Error("rate_limited"))).toContain("Çok sık");
  });

  it("düello: oturum düello ucundan açılır, değerlendirme gibi ilerler (ADR-010)", async () => {
    const { source, calls } = fakeSessions("assessment");
    const run = runner(reducer(initialState, { type: "startMode", mode: "assessment", challengeId: "11111111-1111-4111-8111-111111111111" }));
    expect(run.state.serverChallengeId).toBe("11111111-1111-4111-8111-111111111111");
    await startServerSession(source, run.dispatch, "assessment", null, run.state.serverChallengeId);
    expect(run.state.server?.mode).toBe("challenge");
    expect(calls[0]).toBe("challenge:11111111-1111-4111-8111-111111111111");
    await submitServerCase(source, run.dispatch, "s", 1, {}, initialState.telemetry);
    expect(run.state.pendingSummary?.total).toBe(0);
  });

  it("yeni mod sunucu oturumunu sıfırlar; odak yalnız uygulamada tutulur", () => {
    const withMode = reducer(initialState, { type: "startMode", mode: "practice" });
    const withServer = reducer(withMode, { type: "serverStarted", sessionId: "s", mode: "practice", caseCount: 10 });
    expect(withServer.server?.sessionId).toBe("s");
    const reset = reducer(withServer, { type: "startMode", mode: "assessment", focusFinding: "s3" });
    expect(reset.server).toBeNull();
    expect(reset.serverFocus).toBeNull();
  });
});
