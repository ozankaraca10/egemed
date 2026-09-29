import { describe, expect, it } from "vitest";
import {
  SUSPEND_LIMIT_12,
  createMemoryRuntimeAdapter,
  createNoopRuntimeAdapter,
  createSimRuntime,
  deserializeSuspend,
  encodeMark,
  serializeSuspend,
} from "../../../packages/sim-opaca/src/index";
import type {
  CaseResult,
  ImageRecord,
  InteractionRecord,
  Question,
  RuntimeAdapter,
  RuntimeOptions,
  SimRuntime,
  SuspendPayload,
} from "../../../packages/sim-opaca/src/index";

/** SCORM çalışma zamanı grubu — kaynak egemed-opaca tests/core.test.ts
 *  `describe('SCORM çalışma zamanı')` portu: 6 kaynak testi adaptör üzerinden uyarlandı (+3 seam testi).
 *  SCORM'a özgü pencere taraması ve `cmi.*` alan adları taşınmaz (bkz. .egemed-run/summary.md emekli listesi);
 *  öğrenci adı/e-posta hiçbir testte işlenmez. Zaman enjekte edilir. */

const img = (over: Partial<ImageRecord> = {}): ImageRecord => ({
  id: "img_t",
  sourceDataset: "nih-cxr14",
  sourceFile: "t.png",
  viewPosition: "PA",
  ageYears: 50,
  sex: "F",
  population: "yetiskin",
  width: 1000,
  height: 1000,
  originalWidth: 1000,
  originalHeight: 1000,
  findings: { pneumothorax: "expert_bbox" },
  negatives: { fracture: "expert_panel" },
  annotations: [{ finding: "pneumothorax", source: "expert_bbox", x: 0.6, y: 0.1, w: 0.2, h: 0.3 }],
  quality: null,
  runtimeUrl: "assets/xray/runtime/img_t.webp",
  bytes: 1,
  validationStatus: "validated",
  clinicalReview: "beklemede",
  issues: [],
  ...over,
});

const qChoice: Question = {
  id: "q1",
  type: "finding_identify",
  domain: "recognition",
  prompt: "p",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correct: ["a"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const qMark: Question = {
  id: "q2",
  type: "localization",
  domain: "localization",
  prompt: "p",
  options: [],
  correct: [],
  targetFinding: "pneumothorax",
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const qQuality: Question = {
  id: "q3",
  type: "film_quality",
  domain: "quality",
  prompt: "p",
  options: [
    { id: "a", label: "PA" },
    { id: "b", label: "AP" },
  ],
  correct: ["a"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const DOMAIN_KEYS = [
  "technique",
  "systematic",
  "quality",
  "localization",
  "recognition",
  "interpretation",
  "diagnosis",
] as const;

const domains = (): CaseResult["domains"] =>
  Object.fromEntries(DOMAIN_KEYS.map((k) => [k, { earned: 1, max: 1 }])) as CaseResult["domains"];

const caseResult = (caseId: string): CaseResult => ({
  caseId,
  total: 100,
  max: 100,
  mastery: true,
  domains: domains(),
  answers: [],
  hintsUsed: 0,
});

/** Kaynak testteki `buildSuspend(initialState)` karşılığı (store S6'da portlanacak). */
const suspend = (over: Partial<SuspendPayload> = {}): SuspendPayload => ({
  v: 1,
  mode: "practice",
  caseIndex: 0,
  step: 0,
  answers: {},
  hintsUsed: 0,
  caseResults: [],
  tutorialDone: false,
  visits: {},
  order: [],
  attempts: 0,
  sessionIds: [],
  sessionSeed: 42,
  ...over,
});

const clock = (start = 0) => {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
};

interface RuntimeOverrides {
  getSuspend?: () => SuspendPayload;
  totalCases?: () => number;
  now?: () => number;
  suspendLimit?: number;
}

function makeRuntime(adapter: RuntimeAdapter, over: RuntimeOverrides = {}): SimRuntime {
  const options: RuntimeOptions = {
    adapter,
    getSuspend: over.getSuspend ?? (() => suspend()),
    totalCases: over.totalCases ?? (() => 1),
    now: over.now ?? (() => 0),
  };
  if (over.suspendLimit !== undefined) options.suspendLimit = over.suspendLimit;
  return createSimRuntime(options);
}

describe("SCORM çalışma zamanı (kaynak davranışı, adaptör üzerinden)", () => {
  it("etkileşimler: seçmeli choice, işaret fill-in; yanıtsız soru kaydedilmez", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter);
    rt.saveInteractions("case_t", [qChoice, qMark, qQuality], { q1: ["b"], q2: [encodeMark({ x: 0.7, y: 0.2 })] }, img());
    expect(adapter.interactions).toHaveLength(2);
    expect(adapter.interactions[0]).toMatchObject({ id: "case_t.q1", type: "choice", response: ["b"], correct: false });
    expect(adapter.interactions[1]).toMatchObject({ id: "case_t.q2", type: "fill-in", response: ["x70y20"], correct: true });
  });

  it("gecikme saniyeye yuvarlanır; gecikme verilmeyen kayıtta alan yoktur", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter);
    rt.saveInteractions("case_t", [qChoice, qQuality], { q1: ["a"], q3: ["a"] }, undefined, { q1: 2_400 });
    expect(adapter.interactions[0]).toMatchObject({ correct: true, latencySec: 2 });
    expect(adapter.interactions[1]).not.toHaveProperty("latencySec");
  });

  it("önceki etkileşimlerin ardına eklenir (kaynak: interactions._count)", () => {
    const prior = Array.from(
      { length: 4 },
      (_, i): InteractionRecord => ({ id: `old.${i}`, type: "choice", response: ["a"], correct: true })
    );
    const adapter = createMemoryRuntimeAdapter({ interactions: prior });
    const rt = makeRuntime(adapter);
    rt.saveInteractions("c", [qChoice], { q1: ["a"] }, undefined);
    expect(adapter.interactions).toHaveLength(5);
    expect(adapter.interactions.slice(0, 4).map((r) => r.id)).toEqual(["old.0", "old.1", "old.2", "old.3"]);
    expect(adapter.interactions[4]!.id).toBe("c.q1");
  });

  it("başlatma kayıtlı suspend'i geri yükler; terminate sonrası yazım olmaz (kaynak O3)", () => {
    const t = clock(1_000);
    const restored = suspend({ caseIndex: 3, step: 1, attempts: 2 });
    const adapter = createMemoryRuntimeAdapter({ suspendData: serializeSuspend(restored) });
    const rt = makeRuntime(adapter, { now: t.now, getSuspend: () => restored });
    expect(rt.init()).toMatchObject({ caseIndex: 3, step: 1, attempts: 2 });
    t.advance(65_000);
    rt.terminate();
    expect(rt.terminated).toBe(true);
    expect(adapter.finished).toEqual({ elapsedSec: 65, completed: false });
    const writes = adapter.calls.length;
    rt.terminate();
    rt.saveProgress(restored);
    rt.reportScore(90, true, true);
    expect(adapter.calls).toHaveLength(writes);
  });

  it("puan raporu ve ilerleme ölçüsü", () => {
    const adapter = createMemoryRuntimeAdapter();
    const results = [caseResult("a"), caseResult("b")];
    const rt = makeRuntime(adapter, { totalCases: () => 4, getSuspend: () => suspend({ caseResults: results }) });
    rt.reportScore(72, false, true);
    expect(adapter.score).toEqual({ score: 72, passed: false, finished: true, progress: 0.5 });
    rt.terminate();
    expect(adapter.finished!.completed).toBe(true);

    const full = makeRuntime(adapter, { totalCases: () => 1, getSuspend: () => suspend({ caseResults: [...results, caseResult("c")] }) });
    full.reportScore(100, true, true);
    expect(adapter.score!.progress).toBe(1);

    const empty = makeRuntime(adapter, { totalCases: () => 0, getSuspend: () => suspend({ caseResults: [caseResult("a")] }) });
    empty.reportScore(0, false, false);
    expect(adapter.score!.progress).toBe(1);
  });

  it("suspend sınırı ve konum (kaynak 1.2 limiti)", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter, { suspendLimit: SUSPEND_LIMIT_12 });
    const big = suspend({
      sessionIds: ["s1", "s2"],
      caseResults: Array.from({ length: 60 }, (_, i) => caseResult(`auto_rsna_${i}_xxxxxxxxxxxxxxxx`)),
    });
    rt.saveProgress(big);
    expect(adapter.suspendData!.length).toBeLessThanOrEqual(SUSPEND_LIMIT_12);
    expect(adapter.location).toBe("case:0:step:0");
    const back = deserializeSuspend(adapter.suspendData)!;
    expect(back.sessionSeed).toBe(42);
    expect(back.sessionIds).toEqual(["s1", "s2"]);
  });

  it("bellek adaptörü çağrıları kaydeder; no-op hiçbir şey tutmaz (kaynak: MockAdapter)", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter);
    rt.saveProgress(suspend({ caseIndex: 1 }));
    rt.reportScore(10, false, false);
    rt.terminate();
    expect(adapter.calls.map((c) => c.type)).toEqual(["setSuspend", "flush", "setScore", "flush", "finish", "flush"]);
    expect(adapter.flushCount).toBe(3);
    expect(adapter.finished).toEqual({ elapsedSec: 0, completed: false });

    const noop = createNoopRuntimeAdapter();
    const rt2 = makeRuntime(noop);
    expect(rt2.init()).toBeNull();
    rt2.saveProgress(suspend());
    rt2.reportScore(0, false, false);
    rt2.terminate();
    expect(rt2.terminated).toBe(true);
  });

  it("flushNow geçerli suspend'i ve konumu yazar", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter, { getSuspend: () => suspend({ caseIndex: 3, step: 1 }) });
    rt.flushNow();
    expect(adapter.location).toBe("case:3:step:1");
    expect(adapter.calls.map((c) => c.type)).toEqual(["setSuspend", "flush"]);

  });

  it("adaptör yüzeyi altı ilkelden oluşur; öğrenci kimliği/pencere alanı taşımaz (KVKK)", () => {
    expect(Object.keys(createNoopRuntimeAdapter()).sort()).toEqual([
      "finish",
      "flush",
      "initialize",
      "recordInteraction",
      "setScore",
      "setSuspend",
    ]);
  });
});
