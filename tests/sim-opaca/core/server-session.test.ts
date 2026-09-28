import { describe, expect, it } from "vitest";
import { opacaPublicCaseSchema } from "../../../packages/contracts/src/index";
import {
  SESSION_ASSET_PREFIX,
  fromServerResult,
  initialState,
  isServerCaseId,
  pendingAssessmentResult,
  reducer,
  reviewOf,
  serverCaseId,
  snapshotOf,
  toClientCase,
  type AppState,
  type ServerClientCase,
} from "../../../packages/sim-opaca/src/index";
import { caseResult, publicCase, publicCaseWithStack } from "../session-fixture";

/** A2.3 (ADR-009): anahtarsız vaka → istemci `CaseDef` uyarlaması sızıntı taşımaz;
 *  sunucu sonucu ekran biçimine eksiksiz çevrilir. */

const imageUrl = (sessionId: string, token: string) => `/api/sims/opaca/sessions/${sessionId}/image/${token}`;
const SESSION_ID = "11111111-1111-4111-8111-111111111111";

describe("toClientCase (anahtarsız vaka → CaseDef)", () => {
  it("sözleşmeye uyan public vakayı anahtarsız istemci vakasına çevirir", () => {
    const publicEntry = publicCase(3);
    expect(opacaPublicCaseSchema.safeParse(publicEntry).success).toBe(true);
    const client = toClientCase(publicEntry, "practice", SESSION_ID, imageUrl);
    expect(client.id).toBe("srv-3");
    expect(isServerCaseId(client.id)).toBe(true);
    expect(client.title).toBe("Vaka 3");
    expect(client.modes).toEqual(["practice"]);
    expect(client.serverIndex).toBe(3);
    expect(client.primaryFinding).toBe("");
    expect(client.clinicalDiagnosis).toBeNull();
    expect(client.questions[0]?.correct).toEqual([]);
    expect(client.questions[0]?.feedbackCorrect).toBe("");
    expect(client.questions[0]?.hint).toBe("İpucu yükleniyor…");
  });

  it("görüntü oturum jetonuyla gelir; dosya yolu/bulgu/işaret taşımaz", () => {
    const publicEntry = publicCase(1);
    const client = toClientCase(publicEntry, "assessment", SESSION_ID, imageUrl);
    expect(client.serverImage.runtimeUrl).toBe(`${SESSION_ASSET_PREFIX}${imageUrl(SESSION_ID, "img-token-1")}`);
    expect(client.serverImage.annotations).toEqual([]);
    expect(client.serverImage.findings).toEqual({});
    expect(client.serverImage.width).toBe(1024);
    expect(client.serverImage.height).toBe(1024);
    expect(client.serverImage.modality).toBe("XR");
    expect(client.serverImage.bodyPart).toBe("toraks");
    // Anahtarsız uyarlama: doğru yanıt/geri bildirim/ipucu metni ve dosya yolu taşınmaz.
    for (const question of client.questions) {
      expect(question.correct).toEqual([]);
      expect(question.feedbackCorrect).toBe("");
      expect(question.feedbackIncorrect).toBe("");
    }
    expect(client.serverImage.sourceFile).toBe("");
    const json = JSON.stringify(client);
    expect(json).not.toMatch(/\.webp|\.jpg|assets\//);
    expect(client.title).toBe(publicEntry.label);
  });

  it("BT yığını kareleri de oturum adresine çevrilir", () => {
    const client = toClientCase(publicCaseWithStack(2), "practice", SESSION_ID, imageUrl);
    const stack = client.serverImage.stack ?? [];
    expect(stack).toHaveLength(2);
    expect(stack[0]?.frames).toEqual([
      `${SESSION_ASSET_PREFIX}${imageUrl(SESSION_ID, "frame-a-2")}`,
      `${SESSION_ASSET_PREFIX}${imageUrl(SESSION_ID, "frame-b-2")}`,
    ]);
    expect(stack[1]?.frames).toEqual([`${SESSION_ASSET_PREFIX}${imageUrl(SESSION_ID, "frame-c-2")}`]);
  });

  it("değerlendirmede ipucu yok; uygulamada olan sorular işaretli", () => {
    // Sunucu değerlendirmede `hintAvailable` göndermez (banka kuralı); uyarlama metni yer tutucu yazar.
    const assessmentQuestion = { ...publicCase(1).questions[0]!, hintAvailable: false };
    const assess = toClientCase(publicCase(1, { questions: [assessmentQuestion] }), "assessment", SESSION_ID, imageUrl);
    const practice = toClientCase(publicCase(1), "practice", SESSION_ID, imageUrl);
    expect(assess.questions.every((q) => q.hint === undefined)).toBe(true);
    expect(practice.questions.some((q) => q.hint !== undefined)).toBe(true);
  });
});

describe("sunucu sonucu → CaseResult", () => {
  it("eksik alanlar sıfırla doldurulur; meta başlık/tanı/özet soru geri bildirimini taşır", () => {
    const mapped = fromServerResult(caseResult(1));
    expect(mapped.result.caseId).toBe(serverCaseId(1));
    expect(mapped.result.domains.technique).toEqual({ earned: 0, max: 0 });
    expect(mapped.result.domains.recognition).toEqual({ earned: 25, max: 25 });
    expect(mapped.result.answers).toEqual([{ qid: "q1", correct: true, given: [] }]);
    expect(mapped.meta.title).toBe("Gerçek Vaka Başlığı 1");
    expect(mapped.meta.diagnosis).toBe("Pnömotoraks");
    expect(mapped.meta.questions?.q1?.correctOptionIds).toEqual(["opt-a-1000"]);
  });

  it("değerlendirme yer tutucusu sıfır puanlıdır ve soru taşımaz", () => {
    const pending = pendingAssessmentResult(4);
    expect(pending.caseId).toBe("srv-4");
    expect(pending.total).toBe(0);
    expect(pending.answers).toEqual([]);
    expect(Object.values(pending.domains).every((d) => d.earned === 0 && d.max === 0)).toBe(true);
  });
});

describe("reviewOf (sonuç raporu)", () => {
  it("başlık ve doğru yanıtlar sunucu meta verisinden gelir; yerel vaka kimliği sızmaz", () => {
    const client = toClientCase(publicCase(1), "practice", SESSION_ID, imageUrl);
    let state: AppState = reducer(initialState, { type: "serverStarted", sessionId: SESSION_ID, mode: "practice", caseCount: 1, perCaseLimitMs: null });
    state = reducer(state, { type: "serverCaseLoaded", index: 1, clientCase: client });
    state = reducer(state, {
      type: "serverSnapshot",
      caseId: "srv-1",
      snapshot: { title: "Vaka 1", questions: [{ id: "q1", prompt: "Ana bulgu nedir?", options: [{ id: "opt-a-1000", label: "Pnömotoraks" }] }], given: { q1: ["opt-b-1000"] } },
    });
    state = reducer(state, {
      type: "serverCaseResult",
      result: { ...fromServerResult(caseResult(1, { total: 40, mastery: false, questions: [{ questionId: "q1", correct: false, correctOptionIds: ["opt-a-1000"], feedback: "Yanlış; pnömotoraks." }] })).result, caseId: "srv-1" },
      meta: { title: "Gerçek Vaka Başlığı 1", diagnosis: "Pnömotoraks", summary: "Özet.", questions: { q1: { correctOptionIds: ["opt-a-1000"], feedback: "Yanlış; pnömotoraks." } } },
    });
    expect(state.server).not.toBeNull();
    if (state.server === null) return;
    const review = reviewOf(state.server, "srv-1");
    expect(review.title).toBe("Gerçek Vaka Başlığı 1");
    expect(review.questions[0]?.type).toBe("finding_identify");
    expect(review.questions[0]?.correct).toEqual(["opt-a-1000"]);
    expect(review.questions[0]?.feedbackIncorrect).toContain("pnömotoraks");
  });

  it("anlık görüntüsü olmayan vaka kimliğiyle başlığa düşer", () => {
    let state: AppState = reducer(initialState, { type: "serverStarted", sessionId: SESSION_ID, mode: "practice", caseCount: 1, perCaseLimitMs: null });
    state = reducer(state, { type: "serverFinished", results: [], metas: { "srv-9": { title: "Başlık 9", diagnosis: null, summary: "Özet 9" } } });
    expect(state.server).not.toBeNull();
    if (state.server === null) return;
    expect(reviewOf(state.server, "srv-9")).toEqual({ title: "Başlık 9", questions: [] });
    expect(reviewOf(state.server, "yok")).toEqual({ title: "yok", questions: [] });
  });
});

describe("snapshotOf", () => {
  it("soru metni/seçenekleri ve verilen yanıtları saklar", () => {
    const client = toClientCase(publicCase(1), "practice", SESSION_ID, imageUrl) as ServerClientCase;
    const source = ["opt-a-1000"];
    const snapshot = snapshotOf(client, { q1: source });
    expect(snapshot.title).toBe("Vaka 1");
    expect(snapshot.questions[0]?.prompt).toBe("Ana bulgu nedir?");
    expect(snapshot.questions[0]?.options).toHaveLength(2);
    expect(snapshot.given).toEqual({ q1: ["opt-a-1000"] });
    source.push("xz");
    expect(snapshot.given.q1).toEqual(["opt-a-1000"]);
  });
});
