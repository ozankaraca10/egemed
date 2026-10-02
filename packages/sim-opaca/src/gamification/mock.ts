/** Tohumlu demo akranlar (yol haritası §1, §4). */

import type { Cohort, Period } from "@egemed/gamification-core";
import {
  dayKeyTr,
  levelForXp,
  monthKeyTr,
  periodRangeTr,
  startOfAcademicYearTr,
  startOfWeekTr,
} from "@egemed/gamification-core";
import { OPACA_RULES } from "./rules";

interface DemoPeer {
  id: string;
  displayName: string | null;
  public: boolean;
  cohort: Cohort;
}

export const DEMO_PEERS: DemoPeer[] = [
  { id: "demo-01", displayName: "Deniz Kaya", public: true, cohort: 5 },
  { id: "demo-02", displayName: "Ayşe Yıldız", public: true, cohort: 3 },
  { id: "demo-03", displayName: "Mert Tunç", public: true, cohort: 6 },
  { id: "demo-04", displayName: "Ece Sarı", public: true, cohort: 4 },
  { id: "demo-05", displayName: "Can Öztürk", public: true, cohort: 5 },
  { id: "demo-06", displayName: null, public: false, cohort: 5 },
  { id: "demo-07", displayName: "Zeynep Arslan", public: true, cohort: 4 },
  { id: "demo-08", displayName: "Burak Demir", public: true, cohort: 6 },
  { id: "demo-09", displayName: "Elif Şahin", public: true, cohort: 4 },
  { id: "demo-10", displayName: null, public: false, cohort: 2 },
  { id: "demo-11", displayName: "Kerem Aydın", public: true, cohort: 1 },
  { id: "demo-12", displayName: null, public: false, cohort: 4 },
  { id: "demo-13", displayName: "Ahmet Polat", public: true, cohort: 2 },
  { id: "demo-14", displayName: "İrem Koç", public: true, cohort: 1 },
];

function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function periodKeyFor(period: Period, now: Date): string {
  switch (period) {
    case "today":
      return dayKeyTr(now);
    case "week":
      return dayKeyTr(startOfWeekTr(now));
    case "month":
      return monthKeyTr(now);
    case "academic_year":
      return dayKeyTr(startOfAcademicYearTr(now));
  }
}

const MAX_ATTEMPTS_BY_PERIOD: Record<Period, number> = {
  today: 1,
  week: 3,
  month: 8,
  academic_year: 40,
};

interface DemoPeerPeriodRow {
  periodScore: number | null;
  attemptsCount: number;
  reachedAt: string | null;
  totalXp: number;
  level: number;
}

export function demoPeriodRow(peer: DemoPeer, period: Period, now: Date): DemoPeerPeriodRow {
  const periodKey = periodKeyFor(period, now);
  const rng = mulberry32(seedFromString(`${peer.id}|${periodKey}`));

  const maxAttempts = MAX_ATTEMPTS_BY_PERIOD[period];
  const attemptsCount = Math.floor(rng() * (maxAttempts + 1));

  const xpRng = mulberry32(seedFromString(`${peer.id}|xp|${periodKey}`));
  const totalXp = Math.round(300 + xpRng() * 4200);
  const level = levelForXp(totalXp, OPACA_RULES).level;

  if (attemptsCount < OPACA_RULES.ranking.minAttempts) {
    return { periodScore: null, attemptsCount, reachedAt: null, totalXp, level };
  }

  const base = 60 + rng() * 35;
  const factor = 10 ** OPACA_RULES.ranking.roundDecimals;
  const periodScore = Math.round(base * factor) / factor;

  const { start, end } = periodRangeTr(period, now);
  const span = Math.max(0, end.getTime() - start.getTime());
  const reachedAt = new Date(start.getTime() + rng() * span).toISOString();

  return { periodScore, attemptsCount, reachedAt, totalXp, level };
}
