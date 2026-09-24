/* Pulse müfredat indeksi (S4). Yapı davranışı kaynak curriculum.js:1-6,571-594'ten;
   authored içerik S3 modülünden gelir. */

import { curriculum } from "../data/curriculum";
import type { PulseCurriculumItem } from "../data/curriculum";

export interface CurriculumBank {
  readonly objective: string;
  readonly options: readonly [string, string, string, string, string];
  readonly explanations: readonly [string, string, string, string, string];
}

/** Kaynak seededPermutation algoritmasının kimlik tabanlı, birebir TS karşılığı. */
export function seededPermutation(id: string): [number, number, number, number, number] {
  let h = 1779033703 ^ id.length;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  let seed = h >>> 0;
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const order: [number, number, number, number, number] = [0, 1, 2, 3, 4];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((child) => freeze(child));
    Object.freeze(value);
  }
  return value;
}

const allItems = [...curriculum.cases, ...curriculum.questions];
const byId = Object.fromEntries(allItems.map((item) => [item.id, item]));

function bankFor(item: PulseCurriculumItem): CurriculumBank {
  const order = seededPermutation(item.id);
  const options = Array<string>(5);
  const explanations = Array<string>(5);
  item.options.forEach((option, position) => { options[order[position]!] = option; });
  item.explanations.forEach((explanation, position) => { explanations[order[position]!] = explanation; });
  return {
    objective: item.objectiveIds[0] ?? "",
    options: options as [string, string, string, string, string],
    explanations: explanations as [string, string, string, string, string],
  };
}

const mutableBanks: Record<string, CurriculumBank> = {};
for (const item of allItems) mutableBanks[item.decisionId] ??= bankFor(item);

/** S3 authored verisini kaynak yapısında indeksler; seçenek bankalarını kanonik sırada tutar. */
export const curriculumIndex = freeze({
  cases: curriculum.cases,
  questions: curriculum.questions,
  byId,
  banks: mutableBanks,
});

export function optionsFor(id: string): readonly [string, string, string, string, string] | undefined {
  const item = curriculumIndex.byId[id];
  const bank = item === undefined ? undefined : curriculumIndex.banks[item.decisionId];
  if (item === undefined || bank === undefined) return undefined;
  return seededPermutation(id).map((position) => bank.options[position]) as [string, string, string, string, string];
}

export function explanationsFor(id: string): readonly [string, string, string, string, string] | undefined {
  const item = curriculumIndex.byId[id];
  const bank = item === undefined ? undefined : curriculumIndex.banks[item.decisionId];
  if (item === undefined || bank === undefined) return undefined;
  return seededPermutation(id).map((position) => bank.explanations[position]) as [string, string, string, string, string];
}
