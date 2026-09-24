import { describe, expect, it } from "vitest";
import {
  buildQuizResultsView,
  buildResultsCsv,
  buildSessionCompletionPayload,
  gradeQuiz,
  resetQuizProgress,
} from "../../packages/sim-pulse/src/index";
import type { Session } from "../../packages/sim-pulse/src/index";

function gradeFixture() {
  const ids = Array.from({ length: 10 }, (_, i) => `Q${String(i + 1).padStart(3, "0")}`);
  const byId = Object.fromEntries(ids.map((id, i) => [
    id,
    {
      title: i === 2 ? '=HYPERLINK("http://x")' : `Sentetik soru ${i + 1}`,
      correct: i % 5,
      objectiveIds: [i < 5 ? "O1" : "O2"],
    },
  ]));
  const submitted = Array(10).fill(true);
  const answers = ids.map((_, i) => {
    if (i === 2 || i === 7 || i === 9) return 4;
    return i % 5;
  });
  return gradeQuiz({ ids, answers, submitted, byId });
}

describe("Pulse sonuçlar modeli", () => {
  it("alan raporunu objective kırılımıyla hesaplar", () => {
    const grade = gradeFixture();
    const results = buildQuizResultsView(grade, { O1: "Ritim", O2: "İleti" });
    expect(results.summary).toMatchObject({
      total: 10,
      answered: 10,
      correct: 8,
      score: 80,
      passed: true,
      title: "Başarılı",
    });
    expect(results.areas).toEqual([
      { key: "O1", label: "Ritim", total: 5, answered: 5, correct: 4, score: 80 },
      { key: "O2", label: "İleti", total: 5, answered: 5, correct: 4, score: 80 },
    ]);
  });

  it("8/10 başarı eşiğinde session payload'ını K-P2 uyumlu üretir", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `Q${String(i + 1).padStart(3, "0")}`);
    const byId = Object.fromEntries(ids.map((id, i) => [id, { title: id, correct: i % 5, objectiveIds: ["O1"] }]));
    const grade = gradeQuiz({
      ids,
      submitted: Array(10).fill(true),
      answers: ids.map((_, i) => (i === 0 || i === 8 ? 4 : i % 5)),
      byId,
    });
    const payload = buildSessionCompletionPayload(buildQuizResultsView(grade).summary);
    expect(payload).toEqual({
      completion: "passed",
      passed: true,
      score: 80,
      totalScore: 80,
      attemptScore: 80,
      threshold: 80,
    });
  });

  it("CSV çıktısında formül enjeksiyonunu kaçırır ve BOM ile üretir", () => {
    const results = buildQuizResultsView(gradeFixture(), { O1: "Ritim", O2: "İleti" });
    const csv = buildResultsCsv(results);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK(\"\"http://x\"\")");
    expect(csv).toContain("alan;dogru;yanitlanan;toplam;puan");
    expect(csv.split("\n").at(-1)).toBe("");
  });

  it("reset akışı aynı soru setini koruyup yanıt/submit/score bayraklarını temizler", () => {
    const session: Session = {
      id: "quiz-session-1",
      ids: ["Q001", "Q002", "Q003", "Q004", "Q005", "Q006", "Q007", "Q008", "Q009", "Q010"],
      answers: [0, 1, 2, 3, 4, 0, 1, 2, 3, 4],
      submitted: Array(10).fill(true),
      leadSelections: Array.from({ length: 10 }, () => ["II", "aVF", "V3"]),
      interactionIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    };
    const reset = resetQuizProgress(session);
    expect(reset.quizSession.ids).toEqual(session.ids);
    expect(reset.quizSession.answers.every((answer) => answer === null)).toBe(true);
    expect(reset.quizSession.submitted.every((value) => value === false)).toBe(true);
    expect(reset.quizSession.interactionIndices.every((value) => value === null)).toBe(true);
    expect([reset.assessed, reset.score, reset.attemptScore, reset.passed]).toEqual([false, null, null, false]);
  });
});
