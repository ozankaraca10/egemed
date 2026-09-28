import { describe, expect, it } from "vitest";
import {
  AUSCULTA_BADGES,
  DUEL_BADGES,
  OPACA_BADGES,
  PULSE_BADGES,
  duelBadgeIds,
  duelStatsFrom,
  type DuelOutcomeRow,
} from "../../packages/gami-catalogs/src/index";

// T221 — düello rozetleri: düello istatistiği `challenges` sonuçlarından
// (deneme özetlerinden DEĞİL) türetilir; beraberlik galibiyet sayılmaz.

const now = new Date("2026-09-28T10:00:00.000Z");

const row = (patch: Partial<DuelOutcomeRow> = {}): DuelOutcomeRow => ({
  inviterId: "me",
  opponentId: "rival",
  winner: "inviter",
  finishedAt: 1_000,
  ...patch,
});

describe("duelStatsFrom", () => {
  it("farklı rakip sayımı: aynı kişiyle beş düello birdir; sonuçlanmayan/süresi dolan sayılmaz", () => {
    const stats = duelStatsFrom(
      [
        row({ finishedAt: 1_000 }),
        row({ finishedAt: 2_000 }),
        row({ finishedAt: 3_000 }),
        row({ finishedAt: 4_000 }),
        row({ finishedAt: 5_000 }),
        row({ opponentId: null, winner: null, finishedAt: null }), // açık davet
        row({ opponentId: "dolan", winner: null, finishedAt: null }), // süresi dolmuş
        row({ inviterId: "baska", opponentId: "baska-2", finishedAt: 6_000 }), // başkasının düellosu
      ],
      "me",
    );
    expect(stats).toEqual({ completed: 5, wins: 5, rematchWin: false, distinctOpponents: 1 });
  });

  it("beraberlik galibiyet değildir ama sonuçlanmış düello ve rakipsiz sayılmaz", () => {
    const stats = duelStatsFrom([row({ winner: "draw" }), row({ opponentId: "r2", winner: "opponent" })], "me");
    expect(stats).toEqual({ completed: 2, wins: 0, rematchWin: false, distinctOpponents: 2 });
  });

  it("toplam galibiyet sayılır (ardışıklık gerekmez)", () => {
    const rows = [
      row({ opponentId: "a", winner: "inviter", finishedAt: 1 }),
      row({ opponentId: "b", winner: "opponent", finishedAt: 2 }),
      row({ opponentId: "c", winner: "inviter", finishedAt: 3 }),
      row({ opponentId: "d", winner: "draw", finishedAt: 4 }),
      row({ opponentId: "e", winner: "inviter", finishedAt: 5 }),
      row({ inviterId: "f", opponentId: "me", winner: "inviter", finishedAt: 6 }),
    ];
    const stats = duelStatsFrom(rows, "me");
    expect(stats.wins).toBe(3);
    expect(stats.completed).toBe(6);
    expect(stats.distinctOpponents).toBe(6);
  });

  it("rövanş: önce kayıp sonra aynı rakibe galibiyet true; farklı rakibe ya da önce galibiyet false", () => {
    const lossThenWin = [row({ winner: "opponent", finishedAt: 1 }), row({ winner: "inviter", finishedAt: 2 })];
    expect(duelStatsFrom(lossThenWin, "me").rematchWin).toBe(true);

    const winThenLoss = [row({ winner: "inviter", finishedAt: 1 }), row({ winner: "opponent", finishedAt: 2 })];
    expect(duelStatsFrom(winThenLoss, "me").rematchWin).toBe(false);

    const otherOpponent = [
      row({ opponentId: "a", winner: "opponent", finishedAt: 1 }),
      row({ opponentId: "b", winner: "inviter", finishedAt: 2 }),
    ];
    expect(duelStatsFrom(otherOpponent, "me").rematchWin).toBe(false);

    const opponentPerspective = [row({ inviterId: "rival", opponentId: "me", winner: "inviter", finishedAt: 1 }), row({ inviterId: "rival", opponentId: "me", winner: "opponent", finishedAt: 2 })];
    expect(duelStatsFrom(opponentPerspective, "me").rematchWin).toBe(true);
  });
});

describe("düello rozetleri (katmanlı galibiyet seti)", () => {
  it("katalog: dokuz rozet, doğru katmanlar", () => {
    expect(DUEL_BADGES.map((badge) => badge.id)).toEqual([
      "duel-first",
      "duel-first-win",
      "duel-wins-3",
      "duel-wins-10",
      "duel-wins-25",
      "duel-rematch",
      "duel-rivals-3",
      "duel-rivals-10",
      "duel-rivals-25",
    ]);
    const tierOf = Object.fromEntries(DUEL_BADGES.map((badge) => [badge.id, badge.tier]));
    expect(tierOf).toEqual({
      "duel-first": "bronze",
      "duel-first-win": "bronze",
      "duel-wins-3": "bronze",
      "duel-wins-10": "silver",
      "duel-wins-25": "gold",
      "duel-rematch": "silver",
      "duel-rivals-3": "bronze",
      "duel-rivals-10": "silver",
      "duel-rivals-25": "gold",
    });
    expect(DUEL_BADGES.every((badge) => badge.category === "challenge")).toBe(true);
  });

  it("eşikler: ilk düello/galibiyet, toplam galibiyet ve farklı rakip kademeleri", () => {
    expect(duelBadgeIds({ completed: 0, wins: 0, rematchWin: false, distinctOpponents: 0 }, now)).toEqual([]);
    expect(duelBadgeIds({ completed: 1, wins: 1, rematchWin: false, distinctOpponents: 1 }, now)).toEqual(
      expect.arrayContaining(["duel-first", "duel-first-win"]),
    );
    expect(duelBadgeIds({ completed: 2, wins: 2, rematchWin: false, distinctOpponents: 2 }, now)).not.toContain("duel-wins-3");
    expect(duelBadgeIds({ completed: 3, wins: 3, rematchWin: false, distinctOpponents: 3 }, now)).toEqual(
      expect.arrayContaining(["duel-wins-3", "duel-rivals-3"]),
    );
    expect(duelBadgeIds({ completed: 10, wins: 10, rematchWin: false, distinctOpponents: 10 }, now)).toEqual(
      expect.arrayContaining(["duel-wins-10", "duel-rivals-10"]),
    );
    expect(duelBadgeIds({ completed: 25, wins: 25, rematchWin: false, distinctOpponents: 25 }, now)).toEqual(
      expect.arrayContaining(["duel-wins-25", "duel-rivals-25"]),
    );
    expect(duelBadgeIds({ completed: 1, wins: 0, rematchWin: true, distinctOpponents: 1 }, now)).toContain("duel-rematch");
    // Beraberlik galibiyet rozeti getirmez.
    expect(duelBadgeIds({ completed: 1, wins: 0, rematchWin: false, distinctOpponents: 1 }, now)).not.toContain("duel-first-win");
  });

  it("düello rozetleri üç simin kataloğunda aynı kimlik ve katmanla listelenir", () => {
    for (const catalog of [PULSE_BADGES, AUSCULTA_BADGES, OPACA_BADGES]) {
      const duel = catalog.filter((badge) => badge.category === "challenge");
      expect(duel.map((badge) => badge.id)).toEqual(DUEL_BADGES.map((badge) => badge.id));
      expect(duel.map((badge) => badge.tier)).toEqual(DUEL_BADGES.map((badge) => badge.tier));
    }
  });
});
