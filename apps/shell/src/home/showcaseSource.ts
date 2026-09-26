/**
 * Ana sayfa liderlik vitrini (depo sahibi kararı, 26 Eylül 2026): her sim için
 * AYRI sütun — bu ayın ilk 3'ü (kürsü) + "ilk 10" açılımı, geçen ayın ilk 3'ü ve
 * simin içindeki gibi "Bu ayın ödülü" şeridi. Simler arası birleşik puan veya
 * sıralama üretilmez (ADR-006); adlar sunucunun liderlik kuralıyla gelir (adla
 * görünmeyi seçmeyen öğrenci baş harfle). Kaynak enjekte edilir; geliştirmede
 * deterministik sentetik veri kullanılır (gerçek kişi yok).
 */

import type { ApiClient } from "@egemed/api-client";
import type { SimId } from "@egemed/contracts";

export interface ShowcaseLeader {
  readonly rank: number;
  readonly displayName: string;
  /** Dönem puanı (en iyi değerlendirmelerin ortalaması); yeterli deneme yoksa null. */
  readonly score: number | null;
  readonly isMe: boolean;
}

export interface ShowcaseReward {
  readonly month: string;
  readonly title: string;
  readonly sponsor: string;
}

export interface ShowcaseSim {
  readonly simId: SimId;
  /** Bu ayın sıralaması, en fazla 10 satır (rank artan). */
  readonly leaders: readonly ShowcaseLeader[];
  readonly reward: ShowcaseReward | null;
  /** Geçen ayın kesinleşmiş kazananları (en fazla 3). */
  readonly lastMonthWinners: readonly ShowcaseLeader[];
}

export interface ShowcaseSource {
  getShowcase(): Promise<readonly ShowcaseSim[]>;
}

/** 'YYYY-MM' ayının Türkçe adı ("Eylül 2026"). */
export function monthLabelTr(month: string): string {
  const [year, monthNo] = month.split("-").map(Number) as [number, number];
  const name = new Date(Date.UTC(year, monthNo - 1, 15)).toLocaleDateString("tr-TR", { month: "long", timeZone: "Europe/Istanbul" });
  return `${name.charAt(0).toLocaleUpperCase("tr-TR")}${name.slice(1)} ${year}`;
}

/** Ay sonuna kalan tam gün (İstanbul, sabit UTC+3); ay bittiyse 0. */
export function daysLeftInMonth(month: string, now: number): number {
  const [year, monthNo] = month.split("-").map(Number) as [number, number];
  const end = Date.UTC(year, monthNo, 1) - 3 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}

const SYNTH_NAMES = ["E. Y.", "M. K.", "D. A.", "Z. Ö.", "B. T.", "S. Ç.", "C. D.", "İ. Ş.", "A. B.", "K. E."];

/** Deterministik sentetik vitrin; gerçek öğrenci verisi taşımaz. */
export function createSyntheticShowcaseSource(month = "2026-09"): ShowcaseSource {
  const make = (offset: number, base: number): ShowcaseLeader[] =>
    SYNTH_NAMES.map((_, index) => ({
      rank: index + 1,
      displayName: SYNTH_NAMES[(index + offset) % SYNTH_NAMES.length] ?? "—",
      score: Math.round((base - index * 1.7) * 10) / 10,
      isMe: false,
    }));
  const sims: ShowcaseSim[] = (["pulse", "ausculta", "opaca"] as const).map((simId, index) => ({
    simId,
    leaders: make(index * 3, 96 - index),
    reward:
      simId === "opaca"
        ? { month, title: "Girişimsel Radyolojide bir girişime gözlemci olarak katılım", sponsor: "Radyoloji Anabilim Dalı" }
        : simId === "pulse"
          ? { month, title: "Kardiyoloji kateter laboratuvarında bir gün", sponsor: "Kardiyoloji Anabilim Dalı" }
          : null,
    lastMonthWinners: make(index * 3 + 5, 93 - index).slice(0, 3),
  }));
  return { getShowcase: () => Promise.resolve(sims) };
}

/**
 * API kaynağı: `GET /me/rewards` (ödül + geçen ayın kazananları) ve sim başına
 * `GET /me/gamification/:simId/leaderboard?period=month` (ilk 10). Yalnız erişim
 * verilen simler döner; bir simin sıralaması okunamazsa o sütun boş kalır.
 */
export function createApiShowcaseSource(client: Pick<ApiClient, "rewards" | "gamification">): ShowcaseSource {
  return {
    async getShowcase(): Promise<readonly ShowcaseSim[]> {
      const overview = await client.rewards.getMyRewards();
      return Promise.all(
        overview.data.sims.map(async (entry): Promise<ShowcaseSim> => {
          let leaders: ShowcaseLeader[] = [];
          try {
            const board = await client.gamification.getLeaderboard(entry.simId, { period: "month", cohort: "all", page: 1, pageSize: 10 });
            leaders = board.data.rows
              .filter((row) => row.rank !== null)
              .slice(0, 10)
              .map((row) => ({ rank: row.rank ?? 0, displayName: row.displayName, score: row.periodScore, isMe: row.isMe }));
          } catch {
            leaders = [];
          }
          return {
            simId: entry.simId,
            leaders,
            reward: entry.current === null ? null : { month: entry.current.month, title: entry.current.title, sponsor: entry.current.sponsor },
            lastMonthWinners: entry.lastMonthWinners.slice(0, 3).map((winner) => ({
              rank: winner.rank,
              displayName: winner.displayName,
              score: winner.score,
              isMe: winner.isMe,
            })),
          };
        }),
      );
    },
  };
}
