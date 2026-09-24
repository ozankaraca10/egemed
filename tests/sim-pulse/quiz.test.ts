import { describe, expect, it } from "vitest";
import {
  bindQuizActions,
  createPulseLifecycle,
  createQuizFlowView,
  createQuizQuestionView,
  grade,
  gradeQuiz,
  quizQuestionCardMarkup,
} from "../../packages/sim-pulse/src/index";
import type { AbortControllerLike, ListenerTarget, QuizActionEvent } from "../../packages/sim-pulse/src/index";

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

  emit(type: string, event: QuizActionEvent): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never);
  }

  get count(): number {
    return [...this.listeners.values()].reduce((total, bucket) => total + bucket.size, 0);
  }
}

function lifecycle() {
  const controller: AbortControllerLike = { signal: {}, abort: () => undefined };
  return createPulseLifecycle(controller);
}

const item = {
  id: "Q017",
  title: "Sentetik soru Q017",
  question: "Ritim için en uygun yorum hangisidir?",
  options: [
    "Atriyal fibrilasyon",
    "Normal sinüs ritmi",
    "Monomorfik VT",
    "SVT",
    "2:1 flutter",
  ] as const,
  correct: 1,
  explanations: [
    "AF'de belirgin düzensizlik beklenir.",
    "P-QRS ilişkisi sinüs ritmiyle uyumludur.",
    "Geniş kompleks izlenmiyor.",
    "Hız bu tanı için yeterli değil.",
    "Flutter tabanı gözlenmiyor.",
  ] as const,
};

describe("Pulse quiz modeli", () => {
  it("10 soruluk akışta pager ve tamamlanmayı türetir", () => {
    const flow = createQuizFlowView(18, [true, false, true, true, false, false, false, false, false, false]);
    expect(flow).toMatchObject({
      index: 9,
      total: 10,
      label: "10 /10",
      answered: 3,
      completed: false,
      canPrev: true,
      canNext: false,
    });
    expect(createQuizFlowView(-5, Array(10).fill(true))).toMatchObject({ index: 0, completed: true, answered: 10 });
  });

  it("gönderimden sonra seçenekleri kilitlemez ve geri bildirimi taşır", () => {
    const fresh = createQuizQuestionView(item, null, false);
    expect(fresh.canSubmit).toBe(false);
    expect(fresh.options.every((option) => option.locked === false)).toBe(true);
    expect(fresh.feedback).toBeNull();

    const submittedWrong = createQuizQuestionView(item, 2, true);
    expect(submittedWrong.canSubmit).toBe(true);
    expect(submittedWrong.canContinue).toBe(true);
    expect(submittedWrong.options.every((option) => option.locked === false)).toBe(true);
    expect(submittedWrong.options[item.correct]?.status).toBe("correct");
    expect(submittedWrong.options[2]?.status).toBe("wrong");
    expect(submittedWrong.feedback?.title).toBe("Yanlış");

    const markup = quizQuestionCardMarkup(item, submittedWrong, { index: 1, total: 10, last: false });
    expect(markup).toContain('data-quiz-action="submit"');
    expect(markup).toContain("Yanıtı güncelle");
    expect(markup).toContain("Doğru yanıt:");
  });

  it("grade hesaplaması 8/10 eşiğinde geçer ve alias aynı sonucu verir", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `Q${String(i + 1).padStart(3, "0")}`);
    const byId = Object.fromEntries(ids.map((id, i) => [
      id,
      { title: `Sentetik soru ${i + 1}`, correct: i % 5, objectiveIds: [i < 5 ? "O1" : "O2"] },
    ]));
    const submitted = Array(10).fill(true);
    const answers = ids.map((_, i) => (i === 2 || i === 7 ? 4 : i % 5));
    const graded = gradeQuiz({ ids, answers, submitted, byId });
    expect([graded.total, graded.answered, graded.correct, graded.score, graded.passed]).toEqual([10, 10, 8, 80, true]);
    expect(grade({ ids, answers, submitted, byId })).toEqual(graded);
    expect(graded.rows[0]).toMatchObject({ area: "O1", submitted: true });
    expect(graded.rows[7]).toMatchObject({ area: "O2", correct: false });
  });

  it("action delegasyonu lifecycle dispose sonrasında etkisizleşir", () => {
    const life = lifecycle();
    const target = new Target();
    const actions: string[] = [];
    let prevented = 0;

    bindQuizActions({
      lifecycle: life,
      target,
      dispatch: (action) => actions.push(action),
    });
    expect(target.count).toBe(1);

    target.emit("click", {
      target: { dataset: { quizAction: "submit" } },
      preventDefault: () => { prevented += 1; },
    });
    target.emit("click", {
      target: { dataset: { quizAction: "invalid" } },
      preventDefault: () => { prevented += 1; },
    });
    expect([actions, prevented]).toEqual([["submit"], 1]);

    life.dispose();
    expect(target.count).toBe(0);
    target.emit("click", {
      target: { dataset: { quizAction: "next" } },
      preventDefault: () => { prevented += 1; },
    });
    expect([actions, prevented]).toEqual([["submit"], 1]);
  });
});
