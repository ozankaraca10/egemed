import { describe, expect, it, vi } from "vitest";
import {
  applyPrimaryAction,
  armTimer,
  bindDismissListeners,
  planSessionCompletion,
  rememberQuestionShown,
  reportSessionCompletion,
} from "../../packages/sim-ausculta/src/index";
import type { CaseResult, Question, ScoringWeights, SimulationClock, SimulationListenerEnv } from "../../packages/sim-ausculta/src/index";

/** S15c — rapor çağrısı ve dinleyici/zamanlayıcı temizliği. DOM yok. */

function result(): CaseResult {
  const domains = {
    technique: { earned: 20, max: 20 },
    localization: { earned: 0, max: 0 },
    recognition: { earned: 25, max: 25 },
    interpretation: { earned: 20, max: 20 },
    diagnosis: { earned: 10, max: 10 },
    systematic: { earned: 5, max: 5 },
  } satisfies Record<keyof ScoringWeights, { earned: number; max: number }>;
  return { caseId: "c1", total: 80, max: 100, mastery: true, domains, answers: [], hintsUsed: 0 };
}

function question(id: string): Question {
  return {
    id,
    type: "single_choice",
    domain: "recognition",
    prompt: "Bulgu?",
    options: [{ id: "a", label: "Normal" }],
    correct: ["a"],
    feedbackCorrect: "Doğru",
    feedbackIncorrect: "Yanlış",
  };
}

function listenerEnv(): {
  env: SimulationListenerEnv;
  fire(type: "mousedown" | "keydown", event: { key?: string; target: unknown }): void;
  added: string[];
  removed: string[];
} {
  const handlers = new Map<string, (event: { key?: string; target: unknown }) => void>();
  const added: string[] = [];
  const removed: string[] = [];
  return {
    added,
    removed,
    env: {
      addEventListener(type, handler) {
        added.push(type);
        handlers.set(type, handler);
      },
      removeEventListener(type, handler) {
        expect(handlers.get(type)).toBe(handler);
        removed.push(type);
        handlers.delete(type);
      },
      containsNode: () => false,
    },
    fire(type, event) {
      handlers.get(type)?.(event);
    },
  };
}

function clock(): { clock: SimulationClock; fire(): void; cleared: number[] } {
  let pending: (() => void) | null = null;
  const cleared: number[] = [];
  return {
    cleared,
    clock: {
      setTimeout(handler) {
        pending = handler;
        return 7;
      },
      clearTimeout(handle) {
        cleared.push(handle);
        pending = null;
      },
    },
    fire() {
      const run = pending;
      pending = null;
      run?.();
    },
  };
}

describe("simulation-runtime", () => {
  it("değerlendirme skorunu adaptöre yazar; bayrak kapalıyken oyunlaştırma susar", () => {
    const plan = planSessionCompletion({
      caseIndex: 1,
      caseCount: 1,
      mode: "assessment",
      caseResults: [result()],
      now: 50,
    });
    expect(plan).not.toBeNull();
    if (!plan) return;
    const reportScore = vi.fn();
    const emit = vi.fn();
    const gami = { recordAssessmentComplete: vi.fn() };
    reportSessionCompletion({ plan, runtime: { reportScore }, bus: { emit }, gamiEnabled: false, gami });
    expect(reportScore).toHaveBeenCalledWith(100, true, true);
    expect(emit).toHaveBeenCalledWith({ type: "assessment_completed", total: 100 });
    expect(gami.recordAssessmentComplete).not.toHaveBeenCalled();
    reportSessionCompletion({ plan, runtime: { reportScore }, bus: { emit }, gamiEnabled: true, gami });
    expect(gami.recordAssessmentComplete).toHaveBeenCalledWith({ total: 100, passed: true }, 50);
  });

  it("uygulama oturumunda skor ve oyunlaştırma çağrılmaz", () => {
    const plan = planSessionCompletion({
      caseIndex: 1,
      caseCount: 1,
      mode: "practice",
      caseResults: [result()],
      now: 50,
    });
    expect(plan?.reportScore).toBe(false);
    if (!plan) return;
    const reportScore = vi.fn();
    const gami = { recordAssessmentComplete: vi.fn() };
    reportSessionCompletion({ plan, runtime: { reportScore }, bus: { emit: vi.fn() }, gamiEnabled: true, gami });
    expect(reportScore).not.toHaveBeenCalled();
    expect(gami.recordAssessmentComplete).not.toHaveBeenCalled();
  });

  it("son soruda etkileşimleri adaptöre kaydeder", () => {
    const q = question("q1");
    const saveInteractions = vi.fn();
    const dispatch = vi.fn();
    applyPrimaryAction({
      plan: {
        dispatches: [
          { type: "submitAnswer", qid: "q1", correct: true },
          { type: "finishCase" },
        ],
        saveInteractions: true,
        latency: { q1: 400 },
      },
      dispatch,
      runtime: { saveInteractions },
      caseId: "c1",
      questions: [q],
      answers: { q1: ["a"] },
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(saveInteractions).toHaveBeenCalledWith("c1", [q], { q1: ["a"] }, { q1: 400 });
  });

  it("dinleyiciyi kaldırır ve kesilen zamanlayıcıyı çalıştırmaz", () => {
    const listeners = listenerEnv();
    const dismiss = vi.fn();
    const stopListen = bindDismissListeners(listeners.env, () => false, dismiss);
    listeners.fire("mousedown", { target: {} });
    listeners.fire("keydown", { key: "Escape", target: {} });
    listeners.fire("keydown", { key: "Enter", target: {} });
    expect(dismiss).toHaveBeenCalledTimes(2);
    stopListen();
    stopListen();
    expect(listeners.removed).toEqual(["mousedown", "keydown"]);
    listeners.fire("mousedown", { target: {} });
    expect(dismiss).toHaveBeenCalledTimes(2);

    const timers = clock();
    const fire = vi.fn();
    const stopTimer = armTimer(timers.clock, 600, fire);
    stopTimer();
    timers.fire();
    expect(timers.cleared).toEqual([7]);
    expect(fire).not.toHaveBeenCalled();
  });

  it("soru damgasını bir kez yazar", () => {
    const first = rememberQuestionShown({}, "q1", 10);
    expect(rememberQuestionShown(first, "q1", 99)).toEqual({ q1: 10 });
    expect(rememberQuestionShown(first, "q2", 20)).toEqual({ q1: 10, q2: 20 });
  });
});
