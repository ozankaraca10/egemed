import { describe, expect, it } from "vitest";
import { codedAttemptSummary, deterministicAttemptUuid, offsetIso } from "../../apps/shell/src/reportAttempt";

describe("deterministik deneme kimliği", () => {
  it("aynı yerel kimlik aynı UUIDv5 biçimini üretir", async () => {
    const first = await deterministicAttemptUuid("pulse:pulse-assessment-quiz-1");
    const second = await deterministicAttemptUuid("pulse:pulse-assessment-quiz-1");
    const other = await deterministicAttemptUuid("pulse:pulse-assessment-quiz-2");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("özet yalnız kodlu sayılardır; Z soneki ofsete döner", () => {
    expect(codedAttemptSummary({ score: 100, caseCount: 10 })).toEqual({ score: 100, correct: 10, total: 10 });
    expect(offsetIso("2026-09-24T12:00:00.000Z")).toBe("2026-09-24T12:00:00.000+00:00");
    expect(offsetIso("2026-09-24T15:00:00.000+03:00")).toBe("2026-09-24T15:00:00.000+03:00");
  });
});
