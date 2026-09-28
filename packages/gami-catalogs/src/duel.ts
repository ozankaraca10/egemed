/**
 * EGEMED — Meydan Okuma (ADR-010) düello rozetleri: katmanlı galibiyet seti.
 *
 * Rozet seti üç simde ortaktır ama kazanım sim başına AYRIDIR: `gami_badges`
 * anahtarı (user_id, sim_id, badge_key) olduğundan aynı kimlikler her simde
 * ayrı yazılır (ADR-008). Düello istatistiği deneme özetlerinden DEĞİL,
 * `challenges` tablosundaki sonuçlanmış düellolardan türetilir: rol
 * (inviter/opponent), kazanan ve bitiş zamanı. Ham öğrenci yanıtı içermez.
 */
import { evaluateBadges } from "@egemed/gamification-core";
import type { BadgeDef, BadgeProgress } from "@egemed/gamification-core";

/** Bir düellonun sonucu; beraberlikte kazanan yoktur. */
export type DuelOutcome = "inviter" | "opponent" | "draw";

/**
 * Sonuçlanmış düellonun istatistik satırı. Sonuçlanmamış/süresi dolmuş düello
 * `winner`/`finishedAt` null taşır ve istatistiğe girmez.
 */
export interface DuelOutcomeRow {
  readonly inviterId: string;
  /** Davet kabul edilmediyse null (sonuçlanmamış). */
  readonly opponentId: string | null;
  readonly winner: DuelOutcome | null;
  readonly finishedAt: number | null;
}

/** Düello rozetlerinin değerlendirme durumu (sim başına ayrı hesaplanır). */
export interface DuelStats {
  /** Sonuçlanmış düello sayısı. */
  readonly completed: number;
  /** Galibiyet sayısı; beraberlik galibiyet SAYILMAZ. */
  readonly wins: number;
  /** Aynı rakibe karşı önce kaybedip sonra kazanma (rövanş). */
  readonly rematchWin: boolean;
  /** Sonuçlanmış düellolardaki farklı rakip sayısı. */
  readonly distinctOpponents: number;
}

export const EMPTY_DUEL_STATS: DuelStats = { completed: 0, wins: 0, rematchWin: false, distinctOpponents: 0 };

/** Rozet eşikleri; "galibiyet serisi" ardışık değil TOPLAM galibiyettir. */
export const DUEL_BADGE_RULES = {
  wins: [3, 10, 25],
  rivals: [3, 10, 25],
} as const;

/**
 * Sonuçlanmış düello satırlarından kullanıcının istatistiğini türetir.
 * Satırlar ilgili simin düellolarıdır; `userId` taraf olduğu satırlar sayılır.
 * Sonuçlanmamış (rakip yok / kazanan yok / bitiş yok) satırlar yok sayılır.
 */
export function duelStatsFrom(rows: readonly DuelOutcomeRow[], userId: string): DuelStats {
  const played: { readonly opponentId: string; readonly won: boolean; readonly finishedAt: number }[] = [];
  for (const row of rows) {
    if (row.inviterId !== userId && row.opponentId !== userId) continue;
    if (row.opponentId === null || row.winner === null || row.finishedAt === null) continue;
    const opponentId = row.inviterId === userId ? row.opponentId : row.inviterId;
    const won = row.winner !== "draw" && (row.winner === "inviter") === (row.inviterId === userId);
    played.push({ opponentId, won, finishedAt: row.finishedAt });
  }
  const wins = played.filter((entry) => entry.won).length;
  const rematchWin = played.some(
    (win) => win.won && played.some((loss) => !loss.won && loss.opponentId === win.opponentId && loss.finishedAt < win.finishedAt),
  );
  return {
    completed: played.length,
    wins,
    rematchWin,
    distinctOpponents: new Set(played.map((entry) => entry.opponentId)).size,
  };
}

const progress = (value: number, max: number): BadgeProgress => ({ value, max });

/**
 * Düello rozet tanımları; durum erişimi sim kataloğuna bırakılır. Simler
 * düello istatistiğini sunucudan öğrenir (yerel denemelerden türetilemez),
 * bu yüzden görünümde erişim boş istatistik döner ve kazanım sunucu rozetiyle
 * işaretlenir (`earnedFromServer`).
 */
export function duelBadges<TState>(read: (state: TState) => DuelStats): BadgeDef<TState>[] {
  const stat = (state: TState) => read(state);
  return [
    {
      id: "duel-first",
      category: "challenge",
      tier: "bronze",
      icon: "Medal",
      name: "İlk düello",
      description: "İki tarafın da bitirdiği ilk düelloyu tamamla.",
      rule: "1 düello",
      progress: (state) => progress(Math.min(stat(state).completed, 1), 1),
    },
    {
      id: "duel-first-win",
      category: "challenge",
      tier: "bronze",
      icon: "Award",
      name: "İlk galibiyet",
      description: "İlk düellonu kazan. Beraberlik galibiyet sayılmaz.",
      rule: "1 galibiyet",
      progress: (state) => progress(Math.min(stat(state).wins, 1), 1),
    },
    {
      id: "duel-wins-3",
      category: "challenge",
      tier: "bronze",
      icon: "Trophy",
      name: "Düello serisi",
      description: `Toplam ${DUEL_BADGE_RULES.wins[0]} düello kazan.`,
      rule: `${DUEL_BADGE_RULES.wins[0]} galibiyet`,
      progress: (state) => progress(stat(state).wins, DUEL_BADGE_RULES.wins[0]),
    },
    {
      id: "duel-wins-10",
      category: "challenge",
      tier: "silver",
      icon: "Trophy",
      name: "Düello serisi",
      description: `Toplam ${DUEL_BADGE_RULES.wins[1]} düello kazan.`,
      rule: `${DUEL_BADGE_RULES.wins[1]} galibiyet`,
      progress: (state) => progress(stat(state).wins, DUEL_BADGE_RULES.wins[1]),
    },
    {
      id: "duel-wins-25",
      category: "challenge",
      tier: "gold",
      icon: "Trophy",
      name: "Düello serisi",
      description: `Toplam ${DUEL_BADGE_RULES.wins[2]} düello kazan.`,
      rule: `${DUEL_BADGE_RULES.wins[2]} galibiyet`,
      progress: (state) => progress(stat(state).wins, DUEL_BADGE_RULES.wins[2]),
    },
    {
      id: "duel-rematch",
      category: "challenge",
      tier: "silver",
      icon: "ArrowUp",
      name: "Rövanş",
      description: "Daha önce kaybettiğin aynı rakibi sonraki bir düelloda yen.",
      rule: "1 rövanş",
      predicate: (state) => stat(state).rematchWin,
    },
    {
      id: "duel-rivals-3",
      category: "challenge",
      tier: "bronze",
      icon: "User",
      name: "Farklı rakipler",
      description: `Toplam ${DUEL_BADGE_RULES.rivals[0]} farklı kişiyle sonuçlanmış düello oyna; kazanmak gerekmez.`,
      rule: `${DUEL_BADGE_RULES.rivals[0]} rakip`,
      progress: (state) => progress(stat(state).distinctOpponents, DUEL_BADGE_RULES.rivals[0]),
    },
    {
      id: "duel-rivals-10",
      category: "challenge",
      tier: "silver",
      icon: "User",
      name: "Farklı rakipler",
      description: `Toplam ${DUEL_BADGE_RULES.rivals[1]} farklı kişiyle sonuçlanmış düello oyna; kazanmak gerekmez.`,
      rule: `${DUEL_BADGE_RULES.rivals[1]} rakip`,
      progress: (state) => progress(stat(state).distinctOpponents, DUEL_BADGE_RULES.rivals[1]),
    },
    {
      id: "duel-rivals-25",
      category: "challenge",
      tier: "gold",
      icon: "User",
      name: "Farklı rakipler",
      description: `Toplam ${DUEL_BADGE_RULES.rivals[2]} farklı kişiyle sonuçlanmış düello oyna; kazanmak gerekmez.`,
      rule: `${DUEL_BADGE_RULES.rivals[2]} rakip`,
      progress: (state) => progress(stat(state).distinctOpponents, DUEL_BADGE_RULES.rivals[2]),
    },
  ];
}

/** Sunucu değerlendirmesi için düello kataloğu (durum doğrudan istatistiktir). */
export const DUEL_BADGES: BadgeDef<DuelStats>[] = duelBadges((state: DuelStats) => state);

/** Bir kullanıcının düello istatistiğinden kazanılan TÜM rozet kimlikleri (idempotent yazım için). */
export function duelBadgeIds(stats: DuelStats, now: Date): readonly string[] {
  return evaluateBadges(DUEL_BADGES, stats, [], { now }).map((badge) => badge.id);
}
