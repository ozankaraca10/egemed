import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createApiGamificationSource,
  createSyntheticGamificationSource,
  summaryForSim,
  type GamiSimSummary,
} from "../../apps/shell/src/home/gamificationSource";
import { ProgressSectionView, type ProgressSectionViewProps } from "../../apps/shell/src/home/ProgressSection";
import { SIM_IDS } from "../../apps/shell/src/SimCard";
import { gamiAllResponseSchema, gamiSimSummarySchema } from "../../packages/contracts/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it, vi } from "vitest";

/** React eleman ağacını DOM'suz gezer (admin-users.test.ts deseni). */
function collectElements(
  node: unknown,
  predicate: (element: ReactElement) => boolean,
  results: ReactElement[] = [],
): ReactElement[] {
  if (node === null || node === undefined || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, results);
    return results;
  }
  const element = node as ReactElement;
  if (element.type === undefined) return results;
  if (predicate(element)) results.push(element);
  const children = (element.props as { children?: unknown } | undefined)?.children;
  if (children !== undefined) collectElements(children, predicate, results);
  return results;
}

function baseViewProps(overrides: Partial<ProgressSectionViewProps>): ProgressSectionViewProps {
  return {
    onRetry: () => {
      // yalnız zorunlu prop'u doldurur; ilgisiz durumlarda çağrılmaz
    },
    status: "loading",
    summaries: [],
    ...overrides,
  };
}

describe("gamificationSource: sentetik kaynak (E3 §e.8)", () => {
  it("oturum varken üç sim özeti döner, sözleşmeye (gamiSimSummarySchema) uyar", async () => {
    const source = createSyntheticGamificationSource(true);
    const summaries = await source.getSummaries();
    expect(summaries).toHaveLength(SIM_IDS.length);
    expect(new Set(summaries.map((summary) => summary.simId))).toEqual(new Set(SIM_IDS));
    for (const summary of summaries) {
      expect(() => gamiSimSummarySchema.parse(summary), summary.simId).not.toThrow();
    }
  });

  it("oturum yokken boş dizi döner (E3 §e.8: 'sahte oturum yokken boş durum')", async () => {
    const source = createSyntheticGamificationSource(false);
    await expect(source.getSummaries()).resolves.toEqual([]);
  });

  it("deterministiktir: art arda çağrılar aynı sonucu verir; gerçek zamanı okumaz", async () => {
    const source = createSyntheticGamificationSource(true);
    const first = await source.getSummaries();
    const second = await source.getSummaries();
    expect(first).toEqual(second);
    const spy = vi.spyOn(Date, "now");
    await source.getSummaries();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("simler arası birleştirme/toplam yoktur: her özet yalnız kendi sim_id'sini taşır", async () => {
    const summaries = await createSyntheticGamificationSource(true).getSummaries();
    for (const summary of summaries) {
      expect(Object.keys(summary)).not.toContain("totalXp");
    }
  });
});

describe("gamificationSource: summaryForSim", () => {
  const summaries = [
    { simId: "pulse" } as GamiSimSummary,
    { simId: "opaca" } as GamiSimSummary,
  ];
  it("kimliğe göre eşleşen özeti döner; kayıt yoksa undefined (boş durum tetikleyicisi)", () => {
    expect(summaryForSim(summaries, "pulse")).toBe(summaries[0]);
    expect(summaryForSim(summaries, "ausculta")).toBeUndefined();
  });
});

describe("gamificationSource: API kaynağı (@egemed/api-client)", () => {
  it("client.gamification.getAll() yanıtının data.sims dizisini döner", async () => {
    const summary = gamiSimSummarySchema.parse({
      simId: "pulse",
      xp: 10,
      level: 1,
      streak: { current: 0, best: 0, lastDate: null },
      weeklyGoal: { targetXp: 100, currentXp: 0 },
      badges: [],
      leaderboard: { rank: 1, total: 1 },
      attempts: [],
    });
    const response = gamiAllResponseSchema.parse({ data: { sims: [summary] } });
    const client = { gamification: { getAll: () => Promise.resolve(response) } };
    const source = createApiGamificationSource(client as Parameters<typeof createApiGamificationSource>[0]);
    await expect(source.getSummaries()).resolves.toEqual([summary]);
  });
});

describe("ProgressSectionView hata kurtarma", () => {
  it("'Yeniden dene' düğmesi onRetry'ı tetikler", () => {
    let retried = 0;
    const tree = ProgressSectionView(
      baseViewProps({ onRetry: () => { retried += 1; }, status: "error" }),
    ) as ReactElement;
    const html = renderToStaticMarkup(tree);
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain(t("home.progress.error.retry"));
    const [button] = collectElements(tree, (element) => element.type === "button");
    (button?.props as { onClick?: () => void } | undefined)?.onClick?.();
    expect(retried).toBe(1);
  });
});
