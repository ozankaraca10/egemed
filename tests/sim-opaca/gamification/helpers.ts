import type { OpacaAttemptRecord, OpacaExtra } from "../../../packages/sim-opaca/src/gamification/attempt";

let n = 0;

const defaultExtra = (): OpacaExtra => ({
  findings: [],
  localizationHits: 0,
  abcdeComplete: 0,
  qualityCorrect: 0,
  interpretationCorrect: 0,
  fastPerfect: false,
});

/** Test için asgari AttemptRecord (varsayılan: 10 vakalık değerlendirme). */
export function attempt(
  p: Partial<OpacaAttemptRecord> & Partial<OpacaExtra> = {},
): OpacaAttemptRecord {
  n += 1;
  const { extra: extraPartial, ...rest } = p;
  const {
    findings,
    localizationHits,
    abcdeComplete,
    qualityCorrect,
    interpretationCorrect,
    fastPerfect,
    ...recordFields
  } = rest;
  const extra: OpacaExtra = {
    ...defaultExtra(),
    ...(extraPartial ?? {}),
    ...(findings !== undefined ? { findings } : {}),
    ...(localizationHits !== undefined ? { localizationHits } : {}),
    ...(abcdeComplete !== undefined ? { abcdeComplete } : {}),
    ...(qualityCorrect !== undefined ? { qualityCorrect } : {}),
    ...(interpretationCorrect !== undefined ? { interpretationCorrect } : {}),
    ...(fastPerfect !== undefined ? { fastPerfect } : {}),
  };
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
    extra,
    ...recordFields,
  };
}

/** Node ortamında basit bellek içi localStorage. */
export function installMemoryStorage(): Map<string, string> {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
  return m;
}
