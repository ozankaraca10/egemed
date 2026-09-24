import type { AttemptRecord } from "../../packages/gamification-core/src/types";

export type TestAttempt = AttemptRecord<string, Record<string, unknown>>;

let n = 0;

/** Test için asgari AttemptRecord (varsayılan: 10 vakalık değerlendirme); `extra` boş nesnedir. */
export function attempt(p: Partial<TestAttempt> = {}): TestAttempt {
  n += 1;
  return {
    id: `a-${n}`,
    mode: "assessment",
    finishedAt: "2026-09-23T10:00:00.000Z",
    score: 70,
    mastery: false,
    caseCount: 10,
    hintsUsed: 0,
    durationMs: 600_000,
    domains: {},
    extra: {},
    ...p,
  };
}
