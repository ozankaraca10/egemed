import { describe, expect, it } from "vitest";
import {
  bindCaseActions,
  buildCaseReport,
  caseEndMarkup,
  caseQuestionCardMarkup,
  caseStageMarkup,
  createCaseFlowView,
  createCaseQuestionView,
  createPulseLifecycle,
  reviewCaseIndex,
} from "../../packages/sim-pulse/src/index";
import type { AbortControllerLike, CaseActionEvent, ListenerTarget } from "../../packages/sim-pulse/src/index";

class Target implements ListenerTarget {
  readonly listeners = new Map<string, Set<(...args: never[]) => void>>();
  addEventListener(type: string, listener: (...args: never[]) => void): void {
    const bucket = this.listeners.get(type) ?? new Set();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }
  removeEventListener(type: string, listener: (...args: never[]) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, event: CaseActionEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }
  get count(): number {
    return [...this.listeners.values()].reduce((total, bucket) => total + bucket.size, 0);
  }
}

const item = {
  id: "C017",
  title: "Sentetik vaka C017",
  question: "Ritmi en iyi açıklayan ifade hangisidir?",
  options: [
    "Atriyal fibrilasyon",
    "Normal sinüs ritmi",
    "Monomorfik VT",
    "SVT",
    "2:1 flutter",
  ] as const,
  correct: 1,
  explanations: [
    "AF'de düzensizlik beklenir.",
    "P-QRS ilişkisi ve hız sinüs ritmiyle uyumludur.",
    "Geniş kompleks yok.",
    "Hız bu tanı için yeterli değil.",
    "Testere dişi aktivite gözlenmiyor.",
  ] as const,
};

function lifecycle() {
  const controller: AbortControllerLike = { signal: {}, abort: () => undefined };
  return createPulseLifecycle(controller);
}

describe("Pulse vaka ekranı modeli", () => {
  it("10 vaka akışında pager ve tamamlanma durumunu türetir", () => {
    const flow = createCaseFlowView(22, [true, false, true, false, true, false, false, false, false, false]);
    expect(flow).toMatchObject({
      index: 9,
      total: 10,
      label: "10 /10",
      answered: 3,
      completed: false,
      canPrev: true,
      canNext: false,
    });
    expect(createCaseFlowView(-3, Array(10).fill(true))).toMatchObject({ index: 0, answered: 10, completed: true, isFirst: true });
  });

  it("kilit ile öneriyi ayrık taşır; gönderim sonrası doğru/yanlış durumunu işaretler", () => {
    const suggested = createCaseQuestionView(item, null, false, item.correct);
    expect(suggested.options[item.correct]?.suggested).toBe(true);
    expect(suggested.options.every((option) => option.locked === false)).toBe(true);
    expect(suggested.feedback).toBeNull();

    const submitted = createCaseQuestionView(item, 2, true, item.correct);
    expect(submitted.options.every((option) => option.locked)).toBe(true);
    expect(submitted.options.some((option) => option.suggested)).toBe(false);
    expect(submitted.options[item.correct]?.status).toBe("correct");
    expect(submitted.options[2]?.status).toBe("wrong");
    expect(submitted.feedback?.title).toBe("Yanlış");
  });

  it("Simülatörde açmayı yalnız doğru gönderimde gösterir ve markup'a taşır", () => {
    const wrong = createCaseQuestionView(item, 0, true);
    const correct = createCaseQuestionView(item, item.correct, true);
    expect([wrong.canOpenSimulator, correct.canOpenSimulator]).toEqual([false, true]);

    const closed = caseStageMarkup({
      index: 3,
      itemId: item.id,
      compare: false,
      canOpenSimulator: false,
      ecgMarkup: "<canvas id='caseEcgCanvas'></canvas>",
    });
    const opened = caseStageMarkup({
      index: 3,
      itemId: item.id,
      compare: true,
      canOpenSimulator: true,
      ecgMarkup: "<canvas id='caseEcgCanvas'></canvas>",
    });
    expect(closed).not.toContain("Simülatörde aç");
    expect(opened).toContain('data-case-action="open-simulator"');

    const unansweredCard = caseQuestionCardMarkup(item, createCaseQuestionView(item, null, false), { last: false });
    const answeredCard = caseQuestionCardMarkup(item, correct, { last: true });
    expect(unansweredCard).toContain('data-case-action="check" disabled');
    expect(answeredCard).toContain("Doğru!");
    expect(answeredCard).toContain("Vakayı tamamla");
  });

  it("vaka raporunu ve yanlış inceleme başlangıç indeksini üretir", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`);
    const byId = Object.fromEntries(ids.map((id, i) => [id, { title: `Sentetik vaka ${i + 1}`, correct: i % 5 }]));
    const answers = ids.map((_, i) => (i === 1 || i === 6 ? 4 : i % 5));
    const submitted = Array(10).fill(true);
    const report = buildCaseReport({ ids, answers, submitted, byId });

    expect([report.total, report.answered, report.correct, report.firstWrongIndex]).toEqual([10, 10, 8, 1]);
    expect(reviewCaseIndex(report)).toBe(1);
    const markup = caseEndMarkup(report);
    expect(markup).toContain("Oturum tamamlandı · 8/10 doğru");
    expect(markup).toContain('data-case-index="1"');
    expect(markup).toContain('data-case-action="review-wrong"');

    const allCorrect = buildCaseReport({ ids, answers: ids.map((_, i) => i % 5), submitted, byId });
    expect(reviewCaseIndex(allCorrect)).toBe(0);
  });

  it("action delegasyonunu lifecycle ile bağlar ve dispose sonrası etkisizleştirir", () => {
    const life = lifecycle();
    const target = new Target();
    const actions: string[] = [];
    let prevented = 0;
    bindCaseActions({
      lifecycle: life,
      target,
      dispatch: (action) => actions.push(action),
    });
    expect(target.count).toBe(1);

    target.emit("click", {
      target: { dataset: { caseAction: "report" } },
      preventDefault: () => { prevented += 1; },
    });
    target.emit("click", {
      target: { dataset: { caseAction: "unknown" } },
      preventDefault: () => { prevented += 1; },
    });
    expect([actions, prevented]).toEqual([["report"], 1]);

    life.dispose();
    expect(target.count).toBe(0);
    target.emit("click", {
      target: { dataset: { caseAction: "open-simulator" } },
      preventDefault: () => { prevented += 1; },
    });
    expect([actions, prevented]).toEqual([["report"], 1]);
  });
});
