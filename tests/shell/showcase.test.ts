import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createApiShowcaseSource, daysLeftInMonth, monthLabelTr } from "../../apps/shell/src/home/showcaseSource";
import { ShowcaseSection } from "../../apps/shell/src/home/ShowcaseSection";

// Ana sayfa liderlik vitrini (26 Eyl 2026): sim başına ayrı sütun, ilk 3 + ilk 10,
// ödül şeridi ve geçen ayın şampiyonları; oturumsuzken (kaynak null) çizilmez.

describe("vitrin yardımcıları", () => {
  it("ay adı Türkçe, kalan gün İstanbul ay sonuna göre", () => {
    expect(monthLabelTr("2026-09")).toBe("Eylül 2026");
    expect(monthLabelTr("2026-08")).toBe("Ağustos 2026");
    // 2026-09-26 12:00 İstanbul (09:00Z) → ay sonu 2026-09-30T21:00Z → 5 gün (yukarı yuvarlanır).
    expect(daysLeftInMonth("2026-09", Date.UTC(2026, 8, 26, 9))).toBe(5);
    expect(daysLeftInMonth("2026-08", Date.UTC(2026, 8, 26, 9))).toBe(0);
  });

  it("API kaynağı ödül özetini ve aylık sıralamayı birleştirir; sıralama hatası sütunu boşaltır", async () => {
    const source = createApiShowcaseSource({
      rewards: {
        getMyRewards: async () => ({
          data: {
            sims: [
              {
                simId: "pulse",
                current: null,
                lastMonthWinners: [{ month: "2026-08", rank: 1, displayName: "Ali V.", score: 91, isMe: false }],
              },
              { simId: "opaca", current: null, lastMonthWinners: [] },
            ],
          },
        }),
      },
      gamification: {
        getLeaderboard: async (simId: string) => {
          if (simId === "opaca") throw new Error("down");
          return { data: { rows: [{ rank: 1, displayName: "A. V.", periodScore: 88, isMe: true }, { rank: null, displayName: "X", periodScore: null, isMe: false }] } };
        },
      },
    } as never);
    const sims = await source.getShowcase();
    expect(sims[0]).toMatchObject({ simId: "pulse", leaders: [{ rank: 1, displayName: "A. V.", score: 88, isMe: true }] });
    expect(sims[0]?.lastMonthWinners[0]).toMatchObject({ rank: 1, displayName: "Ali V." });
    expect(sims[1]).toMatchObject({ simId: "opaca", leaders: [] });
  });
});

describe("ShowcaseSection", () => {
  it("kaynak yoksa (ziyaretçi/oturumsuz) hiçbir şey çizmez", () => {
    expect(renderToStaticMarkup(createElement(ShowcaseSection, { source: null, month: "2026-09", previousMonth: "2026-08" }))).toBe("");
  });
});
