import { describe, expect, it } from "vitest";
import {
  createMemoryRuntimeAdapter,
  createNoopRuntimeAdapter,
  createSimRuntime,
  deserializeSuspend,
  serializeSuspend,
} from "../../packages/sim-ausculta/src/index";
import type {
  CaseResult,
  InteractionRecord,
  Question,
  RuntimeAdapter,
  RuntimeOptions,
  SimRuntime,
  SuspendPayload,
} from "../../packages/sim-ausculta/src/index";

/** Kaynak `tests/core.test.ts` 31-85 ve 581-719: anlamlı davranış adaptöre uyarlandı.
 *  Pencere taraması, `cmi.*` alan adları ve öğrenci kimliği yok. Emekli liste summary'de. */

const qChoice = (id: string, correct: string[]): Question => ({
  id,
  type: "single_choice",
  domain: "recognition",
  prompt: "P",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correct,
  feedbackCorrect: "",
  feedbackIncorrect: "",
});

const qMulti: Question = {
  id: "q1",
  type: "multi_choice",
  domain: "recognition",
  prompt: "P",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correct: ["a", "b"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const DOMAIN_KEYS = ["technique", "localization", "recognition", "interpretation", "diagnosis", "systematic"] as const;

const caseResult = (caseId: string): CaseResult => ({
  caseId,
  total: 100,
  max: 100,
  mastery: true,
  domains: Object.fromEntries(DOMAIN_KEYS.map((k) => [k, { earned: 1, max: 1 }])) as CaseResult["domains"],
  answers: [],
  hintsUsed: 0,
});

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
  sessionSeed: 0,
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

function makeRuntime(adapter: RuntimeAdapter, over: Partial<RuntimeOptions> = {}): SimRuntime {
  return createSimRuntime({
    adapter,
    getSuspend: over.getSuspend ?? (() => suspend()),
    totalCases: over.totalCases ?? (() => 1),
    now: over.now ?? (() => 0),
    ...(over.suspendLimit !== undefined ? { suspendLimit: over.suspendLimit } : {}),
  });
}

describe("çalışma zamanı (kaynak 31-85 ve 581-719, adaptör)", () => {
  it("bellek adaptörü yazım ve flush tutar (kaynak: mock CRUD)", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter);
    expect(rt.init()).toBeNull();
    rt.saveProgress(suspend({ caseIndex: 1 }));
    rt.reportScore(85, true, false);
    rt.terminate();
    expect(adapter.suspendData).toBeTruthy();
    expect(adapter.score).toMatchObject({ score: 85, passed: true, finished: false });
    expect(adapter.flushCount).toBe(3);
    expect(adapter.finished).toEqual({ elapsedSec: 0, completed: false });
    expect(adapter.calls.map((c) => c.type)).toEqual([
      "initialize",
      "setSuspend",
      "flush",
      "setScore",
      "flush",
      "finish",
      "flush",
    ]);
  });

  it("yanlış yanıt doğru=false; gecikme saniyeye yuvarlanır (kaynak: 2004 incorrect + PT4S)", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter);
    const unanswered = qChoice("q0", ["a"]);
    rt.saveInteractions("case_x", [unanswered, qChoice("q1", ["a"])], { q1: ["b"] }, { q1: 4200 });
    expect(adapter.interactions).toHaveLength(1);
    expect(adapter.interactions[0]).toEqual({
      id: "case_x.q1",
      type: "choice",
      response: ["b"],
      correct: false,
      latencySec: 4,
    });
  });

  it("tip hep choice, kimlik vaka bağlamlı, çoklu yanıt dizi (kaynak O2)", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter);
    rt.saveInteractions("case_af", [qMulti], { q1: ["a", "b"] });
    expect(adapter.interactions[0]).toMatchObject({
      id: "case_af.q1",
      type: "choice",
      response: ["a", "b"],
      correct: true,
    });
    expect(adapter.interactions[0]).not.toHaveProperty("latencySec");
  });

  it("önceki etkileşimlerin ardına eklenir (kaynak O2(d): _count)", () => {
    const prior = Array.from(
      { length: 3 },
      (_, i): InteractionRecord => ({ id: `old.${i}`, type: "choice", response: ["a"], correct: true }),
    );
    const adapter = createMemoryRuntimeAdapter({ interactions: prior });
    const rt = makeRuntime(adapter);
    rt.saveInteractions("case_x", [qChoice("q1", ["a"])], { q1: ["a"] });
    expect(adapter.interactions.map((r) => r.id)).toEqual(["old.0", "old.1", "old.2", "case_x.q1"]);
  });

  it("kapanış: bitmemiş oturum completed=false, bitmiş oturum true (kaynak O3)", () => {
    const t = clock(1_000);
    const ongoing = createMemoryRuntimeAdapter();
    const rtOngoing = makeRuntime(ongoing, { now: t.now, getSuspend: () => suspend({ caseResults: [] }) });
    t.advance(65_000);
    rtOngoing.terminate();
    expect(ongoing.finished).toEqual({ elapsedSec: 65, completed: false });

    const done = createMemoryRuntimeAdapter();
    const results = [caseResult("a"), caseResult("b")];
    const rtDone = makeRuntime(done, { totalCases: () => 4, getSuspend: () => suspend({ caseResults: results }) });
    rtDone.reportScore(90, true, true);
    expect(done.score).toEqual({ score: 90, passed: true, finished: true, progress: 0.5 });
    rtDone.terminate();
    expect(done.finished!.completed).toBe(true);
  });

  it("terminate sonrası yazım olmaz (kaynak D12)", () => {
    const adapter = createMemoryRuntimeAdapter();
    const rt = makeRuntime(adapter);
    rt.terminate();
    expect(rt.terminated).toBe(true);
    const writes = adapter.calls.length;
    rt.reportScore(100, true, true);
    rt.saveProgress(suspend({ tutorialDone: true, attempts: 1 }));
    rt.saveInteractions("case_x", [qChoice("q1", ["a"])], { q1: ["a"] });
    rt.flushNow();
    rt.terminate();
    expect(adapter.calls).toHaveLength(writes);
  });

  it("flushNow suspend ve konum yazar (kaynak: beforeunload suspend_data)", () => {
    const adapter = createMemoryRuntimeAdapter();
    const payload = suspend({
      caseIndex: 2,
      step: 1,
      tutorialDone: true,
      attempts: 1,
      sessionIds: ["a"],
      sessionSeed: 5,
    });
    const rt = makeRuntime(adapter, { getSuspend: () => payload });
    rt.flushNow();
    expect(adapter.location).toBe("case:2:step:1");
    expect(adapter.suspendData).toContain('"c":2');
    expect(deserializeSuspend(adapter.suspendData)).toMatchObject({ caseIndex: 2, step: 1, sessionSeed: 5 });
    expect(adapter.calls.map((c) => c.type)).toEqual(["setSuspend", "flush"]);
  });

  it("init kayıtlı suspend'i geri yükler", () => {
    const restored = suspend({ caseIndex: 3, step: 1, attempts: 2 });
    const adapter = createMemoryRuntimeAdapter({ suspendData: serializeSuspend(restored) });
    const rt = makeRuntime(adapter);
    expect(rt.init()).toMatchObject({ caseIndex: 3, step: 1, attempts: 2 });
  });

  it("no-op hiçbir şey tutmaz; erişilemeyen flush yutulur; yüzeyde kimlik yok", () => {
    const noop = createNoopRuntimeAdapter();
    const rt = makeRuntime(noop);
    expect(rt.init()).toBeNull();
    rt.saveProgress(suspend());
    rt.reportScore(0, false, false);
    rt.terminate();
    expect(rt.terminated).toBe(true);
    expect(Object.keys(noop).sort()).toEqual([
      "finish",
      "flush",
      "initialize",
      "recordInteraction",
      "setScore",
      "setSuspend",
    ]);

  });
});
