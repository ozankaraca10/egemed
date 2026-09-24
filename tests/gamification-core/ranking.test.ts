import { describe, expect, it } from "vitest";
import {
  ALL_COHORTS,
  cmpReachedAt,
  periodScore,
  rankRows,
  rewardStandings,
  type RewardStandingRow,
} from "../../packages/gamification-core/src/ranking";
import { monthlyRewardFor, rewardWinnersHistory } from "../../packages/gamification-core/src/rewards";
import { DEFAULT_RULES } from "../../packages/gamification-core/src/rules";
import type { MonthlyReward, RewardWinner } from "../../packages/gamification-core/src/types";
import { attempt } from "./helpers";

const reward = (p: Partial<MonthlyReward> = {}): MonthlyReward => ({
  month: "2026-09",
  title: "Test ödülü",
  description: "Test",
  sponsor: "Test",
  winnersCount: 3,
  eligibility: { cohorts: [...ALL_COHORTS], minAssessments: 4, requirePublicName: true },
  terms: [],
  ...p,
});

describe("dönem puanı", () => {
  it("en iyi 3 değerlendirmenin ortalaması, 1 ondalık; uygulama sayılmaz", () => {
    const list = [90, 85, 70, 88].map((score, i) => attempt({ score, finishedAt: `2026-09-0${i + 1}T10:00:00.000Z` }));
    list.push(attempt({ mode: "practice", score: 100 }));
    const r = periodScore(list, DEFAULT_RULES);
    expect(r.score).toBe(87.7); // (90 + 88 + 85) / 3 = 87.666…
    expect(r.attemptsCount).toBe(4);
    expect(r.reachedAt).toBe("2026-09-04T10:00:00.000Z"); // en iyi 3'ü tamamlayan son deneme
  });

  it("asgari 2 deneme: 1 deneme → sıralama dışı; 2 deneme → ikisinin ortalaması", () => {
    expect(periodScore([attempt({ score: 95 })], DEFAULT_RULES).score).toBeNull();
    expect(periodScore([attempt({ score: 90 }), attempt({ score: 80 })], DEFAULT_RULES).score).toBe(85);
  });

  it("eşit puanlarda önce tamamlanan deneme seçilir (reachedAt en erken)", () => {
    const list = [
      attempt({ score: 90, finishedAt: "2026-09-01T10:00:00.000Z" }),
      attempt({ score: 90, finishedAt: "2026-09-02T10:00:00.000Z" }),
      attempt({ score: 90, finishedAt: "2026-09-03T10:00:00.000Z" }),
      attempt({ score: 90, finishedAt: "2026-09-10T10:00:00.000Z" }),
    ];
    expect(periodScore(list, DEFAULT_RULES).reachedAt).toBe("2026-09-03T10:00:00.000Z");
  });

  it("sıralama: puan azalan, eşitlikte önce ulaşan; yetersiz deneme rank=null ama listede kalır", () => {
    const rows = rankRows(
      [
        { id: "a", periodScore: 88, attemptsCount: 3, reachedAt: "2026-09-05T00:00:00.000Z" },
        { id: "b", periodScore: 88, attemptsCount: 3, reachedAt: "2026-09-02T00:00:00.000Z" },
        { id: "c", periodScore: 95, attemptsCount: 2, reachedAt: "2026-09-09T00:00:00.000Z" },
        { id: "d", periodScore: null, attemptsCount: 1, reachedAt: null },
      ],
      DEFAULT_RULES,
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.rank]))).toEqual({ a: 3, b: 2, c: 1, d: null });
  });

  it("cmpReachedAt: null en sona düşer", () => {
    expect(cmpReachedAt(null, null)).toBe(0);
    expect(cmpReachedAt(null, "x")).toBe(1);
    expect(cmpReachedAt("x", null)).toBe(-1);
    expect(cmpReachedAt("a", "b")).toBe(-1);
  });
});

describe("ayın ödülü — uygunlar arasında ilk 3", () => {
  const row = (id: string, score: number, p: Partial<RewardStandingRow> = {}): RewardStandingRow => ({
    id,
    cohort: 5,
    public: true,
    periodScore: score,
    attemptsCount: 5,
    reachedAt: "2026-09-10T00:00:00.000Z",
    ...p,
  });

  it("ilk 3 içinde uygun olmayan (asgari deneme / anonim) → adaylık sıradakine kayar; cutoff 3. uygun", () => {
    const { rows, cutoff } = rewardStandings(
      [row("a", 95), row("b", 93, { attemptsCount: 3 }), row("c", 91, { public: false }), row("d", 90), row("e", 88), row("f", 80)],
      reward(),
    );
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId.b?.reason).toBe("min_assessments");
    expect(byId.c?.reason).toBe("private_profile");
    expect(rows.filter((r) => r.candidate).map((r) => r.id)).toEqual(["a", "d", "e"]);
    expect(cutoff).toBe(88);
  });

  it("asgari deneme tam sınırda (4) uygundur, 3 değildir", () => {
    const { rows } = rewardStandings([row("x", 90, { attemptsCount: 4 }), row("y", 90, { attemptsCount: 3 })], reward());
    expect(rows.map((r) => r.reason)).toEqual(["eligible", "min_assessments"]);
  });

  it("kohort reddi: yalnız belirli dönemlere açık ödülde dışarıdaki ve kohortu bilinmeyen elenir", () => {
    const narrow = reward({ eligibility: { cohorts: [4, 5, 6], minAssessments: 4, requirePublicName: true } });
    const { rows } = rewardStandings(
      [row("p", 99, { cohort: 3 }), row("q", 98, { cohort: null }), row("r", 90, { cohort: 6 })],
      narrow,
    );
    expect(rows.map((r) => r.reason)).toEqual(["cohort", "cohort", "eligible"]);
    expect(rows.find((r) => r.candidate)?.id).toBe("r");
  });

  it("tüm sınıflara açık ödülde kohortu bilinmeyen uygundur", () => {
    const { rows } = rewardStandings([row("p", 90, { cohort: null })], reward());
    expect(rows[0]?.reason).toBe("eligible");
    expect(rows[0]?.candidate).toBe(true);
  });

  it("eşitlikte önce ulaşan aday olur", () => {
    const { rows } = rewardStandings(
      [row("late", 90, { reachedAt: "2026-09-20T00:00:00.000Z" }), row("early", 90, { reachedAt: "2026-09-02T00:00:00.000Z" })],
      reward({ winnersCount: 1 }),
    );
    expect(rows.find((r) => r.candidate)?.id).toBe("early");
  });
});

describe("ödül seçimi ve kazanan geçmişi", () => {
  it("yapılandırılmamış ay son yapılandırılmış ödülü o ay için taşır; daha önceki ay için null", () => {
    const catalog = { "2026-09": reward() };
    const oct = monthlyRewardFor(catalog, "2026-10");
    expect(oct?.month).toBe("2026-10");
    expect(oct?.title).toBe("Test ödülü");
    expect(monthlyRewardFor(catalog, "2026-08")).toBeNull();
    expect(monthlyRewardFor({}, "2026-09")).toBeNull();
  });

  it("geçmiş: içinde bulunulan ay hariç son N ay, en yeni ay önce ve ay içinde sıra artan", () => {
    const history: RewardWinner[] = [
      { month: "2026-08", rank: 2, displayName: "B", score: 88, isMe: false },
      { month: "2026-08", rank: 1, displayName: "A", score: 92, isMe: false },
      { month: "2026-07", rank: 1, displayName: "C", score: 90, isMe: false },
      { month: "2026-09", rank: 1, displayName: "D", score: 99, isMe: false },
      { month: "2026-06", rank: 1, displayName: "E", score: 80, isMe: false },
    ];
    const now = new Date("2026-09-23T10:00:00.000Z");
    expect(rewardWinnersHistory(history, 2, now).map((w) => [w.month, w.rank])).toEqual([
      ["2026-08", 1],
      ["2026-08", 2],
      ["2026-07", 1],
    ]);
    expect(rewardWinnersHistory(history, 3, now).map((w) => w.month)).toEqual(["2026-08", "2026-08", "2026-07", "2026-06"]);
    expect(rewardWinnersHistory(history, 3, now).map((w) => w.displayName)).not.toContain("D");
  });
});
