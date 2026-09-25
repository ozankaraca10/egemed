import { describe, expect, it } from "vitest";
import {
  AUSCULTA_BADGES,
  AUSCULTA_BADGE_RULES,
  AUSCULTA_HEART_TOPICS,
  AUSCULTA_LUNG_TOPICS,
  AUSCULTA_SUMMARY_VERSION,
  SIM_BADGE_EVALUATORS,
  auscultaStatsFromSummaries,
  encodeAuscultaSummary,
} from "../../packages/gami-catalogs/src/index";
import type { AuscultaStats } from "../../packages/gami-catalogs/src/index";
import { AUSCULTA_BADGES as SIM_AUSCULTA_BADGES } from "../../packages/sim-ausculta/src/gamification/catalog";
import { AUSCULTA_RULES } from "../../packages/sim-ausculta/src/gamification/rules";
import { LocalGamiRepository, type AuscultaGamiEvent } from "../../packages/sim-ausculta/src/gamification/repo";
import { attemptSummarySchema, BADGE_KEY_PATTERN } from "../../packages/contracts/src/index";
import { evaluateBadges } from "../../packages/gamification-core/src/badges";

/** Deterministik tohumlu üreteç (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_MS = Date.UTC(2026, 8, 1);
const FIXED_NOW = new Date("2026-09-24T09:00:00.000Z");

function memoryStorage(): { getItem(key: string): string | null; setItem(key: string, value: string): void } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

/** Sim'in yerel deposuna akıtılan olay dizisi; tur HER ZAMAN case_completed ile biter
 *  (sunucu değerlendirmesi yeni deneme yazımında koşar: son anlık görüntü tüm sayaçları taşır). */
function randomEvents(next: () => number, round: number): AuscultaGamiEvent[] {
  const count = 1 + Math.floor(next() * 12);
  const events: AuscultaGamiEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = BASE_MS + round * 86_400_000 + index * 3_600_000 + Math.floor(next() * 3_600_000);
    const iso = new Date(at).toISOString();
    if (next() < 0.35) {
      events.push({ type: "correct_diagnosis", id: `dx-${round}-${index}`, finishedAt: iso });
    } else {
      events.push({
        type: "case_completed",
        id: `case-${round}-${index}`,
        finishedAt: iso,
        mode: next() < 0.5 ? "assessment" : "practice",
        score: Math.floor(next() * 101),
        mastery: next() < 0.5,
        hintsUsed: Math.floor(next() * 4),
        domains: {},
      });
    }
  }
  const last = events[events.length - 1];
  if (last === undefined || last.type !== "case_completed") {
    const at = BASE_MS + round * 86_400_000 + count * 3_600_000;
    events.push({
      type: "case_completed",
      id: `case-${round}-final`,
      finishedAt: new Date(at).toISOString(),
      mode: next() < 0.5 ? "assessment" : "practice",
      score: Math.floor(next() * 101),
      mastery: next() < 0.5,
      hintsUsed: Math.floor(next() * 4),
      domains: {},
    });
  }
  return events;
}

/** Birikimli istatistik anlık görüntüsü: önceki değer + tohumlu artış (monoton). */
function nextStats(previous: AuscultaStats | null, next: () => number): AuscultaStats {
  const bump = (base: number): number => base + Math.floor(next() * 4);
  const heart = { normal: 0, extraSounds: 0, murmurTiming: 0, rhythm: 0 };
  const lung = { vesicular: 0, continuous: 0, crackles: 0, pleuralRub: 0 };
  if (previous !== null) {
    Object.assign(heart, previous.heartCorrect);
    Object.assign(lung, previous.lungCorrect);
  }
  for (const topic of AUSCULTA_HEART_TOPICS) heart[topic] = bump(heart[topic]!);
  for (const topic of AUSCULTA_LUNG_TOPICS) lung[topic] = bump(lung[topic]!);
  return {
    listenDisciplineCases: bump(previous?.listenDisciplineCases ?? 0),
    systematicExams: bump(previous?.systematicExams ?? 0),
    cardiacFociExams: bump(previous?.cardiacFociExams ?? 0),
    posteriorLungExams: bump(previous?.posteriorLungExams ?? 0),
    heartCorrect: heart,
    lungCorrect: lung,
    pediatricCorrect: bump(previous?.pediatricCorrect ?? 0),
    mixedCorrect: bump(previous?.mixedCorrect ?? 0),
    headChoiceCorrect: bump(previous?.headChoiceCorrect ?? 0),
    correctDiagnosisCount: bump(previous?.correctDiagnosisCount ?? 0),
  };
}

describe("Ausculta kodlu özet ve rozet istatistiği (ADR-008)", () => {
  it("rozet kimlikleri gami_badges biçimine uyar", () => {
    for (const badge of AUSCULTA_BADGES) {
      expect(BADGE_KEY_PATTERN.test(badge.id), badge.id).toBe(true);
    }
  });

  it("rozet eşikleri sim kurallarıyla aynıdır; tek kaynak sim-ausculta kataloğudur", () => {
    expect(AUSCULTA_BADGE_RULES).toEqual(AUSCULTA_RULES.badges);
    expect(AUSCULTA_BADGES).toBe(SIM_AUSCULTA_BADGES);
  });

  it("kalp ve akciğer konuları sim istatistiğiyle aynı sıradadır", () => {
    const repo = new LocalGamiRepository({ storage: memoryStorage(), now: () => FIXED_NOW });
    const stats = repo.snapshot().stats;
    expect(Object.keys(stats.heartCorrect)).toEqual([...AUSCULTA_HEART_TOPICS]);
    expect(Object.keys(stats.lungCorrect)).toEqual([...AUSCULTA_LUNG_TOPICS]);
  });

  it("özetlerden türetilen istatistik sim deposunun istatistiğiyle birebir aynıdır (tohumlu tur)", () => {
    for (let round = 0; round < 30; round += 1) {
      const next = rng(20260925 + round);
      const events = randomEvents(next, round);
      const repo = new LocalGamiRepository({ storage: memoryStorage(), now: () => FIXED_NOW });
      const summaries: Record<string, number>[] = [];
      for (const event of events) {
        repo.recordEvent(event);
        if (event.type === "case_completed") {
          const record = repo.snapshot().attempts.find((item) => item.id === event.id);
          if (record === undefined) throw new Error(`deneme bulunamadı: ${event.id}`);
          summaries.push(encodeAuscultaSummary(record.extra));
        }
      }
      for (const summary of summaries) expect(attemptSummarySchema.safeParse(summary).success).toBe(true);
      const gold = repo.snapshot().stats;
      const derived = auscultaStatsFromSummaries(summaries);
      expect(derived).toEqual(gold);
      const ctx = { now: FIXED_NOW };
      expect(
        evaluateBadges(AUSCULTA_BADGES, derived, [], ctx).map((badge) => badge.id).sort(),
      ).toEqual(evaluateBadges(SIM_AUSCULTA_BADGES, gold, [], ctx).map((badge) => badge.id).sort());
      const evaluator = SIM_BADGE_EVALUATORS.ausculta;
      expect(evaluator?.badgeIds).toEqual(AUSCULTA_BADGES.map((badge) => badge.id));
      expect([...(evaluator?.newlyEarned(summaries, [], FIXED_NOW) ?? [])].sort()).toEqual(
        [...new Set(repo.snapshot().earned.map((badge) => badge.id))].sort(),
      );
    }
  });

  it("birikimli anlık görüntüler artan sayılarla tek kaynağı doğrular (tohumlu tur)", () => {
    for (let round = 0; round < 30; round += 1) {
      const next = rng(7 * round + 3);
      let previous: AuscultaStats | null = null;
      const summaries: Record<string, number>[] = [];
      const count = 1 + Math.floor(next() * 8);
      for (let index = 0; index < count; index += 1) {
        previous = nextStats(previous, next);
        summaries.push(encodeAuscultaSummary(previous));
      }
      for (const summary of summaries) expect(attemptSummarySchema.safeParse(summary).success).toBe(true);
      const gold = previous;
      if (gold === undefined) throw new Error("tohumlu tur istatistik üretmedi");
      expect(auscultaStatsFromSummaries(summaries)).toEqual(gold);
    }
  });

  it("bozuk, sürümsüz ya da sınır dışı kodlar istatistiği şişiremez", () => {
    const stats = auscultaStatsFromSummaries([
      { "ausculta.listen": 999 },
      {
        "ausculta.v": AUSCULTA_SUMMARY_VERSION + 1,
        "ausculta.listen": 50,
      },
      {
        "ausculta.v": AUSCULTA_SUMMARY_VERSION,
        "ausculta.listen": 999_999,
        "ausculta.sys": 999_999,
        "ausculta.h.normal": 999_999,
        "ausculta.l.crackles": -5,
        "ausculta.diag": 5,
        "ausculta.bilinmeyen": 7,
      },
    ]);
    expect(stats.listenDisciplineCases).toBe(100_000);
    expect(stats.systematicExams).toBe(100_000);
    expect(stats.heartCorrect.normal).toBe(100_000);
    expect(stats.lungCorrect.crackles).toBe(0);
    expect(stats.correctDiagnosisCount).toBe(5);
    expect(stats.pediatricCorrect).toBe(0);
  });
});
