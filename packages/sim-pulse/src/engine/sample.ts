import type { RandomInt } from "./rng";
import type { PulseCurriculum, Section, Session } from "./state";

export const SESSION_COUNT = 10;

export function createSessionId(randomInt: RandomInt): string {
  return Array.from({ length: 3 }, () => randomInt(0x1_0000_0000).toString(36)).join("_").slice(0, 32);
}

export function sample(section: Section, curriculum: PulseCurriculum, randomInt: RandomInt): Session {
  const pool = [...(section === "case" ? curriculum.cases : curriculum.questions)];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const ids = pool.slice(0, SESSION_COUNT);
  return {
    id: createSessionId(randomInt),
    ids,
    answers: Array(SESSION_COUNT).fill(null) as Array<number | null>,
    submitted: Array(SESSION_COUNT).fill(false) as boolean[],
    leadSelections: ids.map((id) => [...curriculum.byId[id]!.ecg.leads]),
    interactionIndices: Array(SESSION_COUNT).fill(null) as Array<number | null>,
  };
}
