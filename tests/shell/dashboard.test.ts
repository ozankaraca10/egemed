import { createElement, type ReactElement } from "react";
import { shellSessionFromDev } from "../../apps/shell/src/session";
import { renderToStaticMarkup } from "react-dom/server";
import type { DevSession } from "../../apps/shell/src/devAuth";
import {
  createApiGamificationSource,
  createSyntheticGamificationSource,
  summaryForSim,
  type GamiSimSummary,
} from "../../apps/shell/src/home/gamificationSource";
import {
  ProgressSection,
  ProgressSectionView,
  type ProgressSectionViewProps,
} from "../../apps/shell/src/home/ProgressSection";
import { simHref } from "../../apps/shell/src/routes";
import { SIM_IDS } from "../../apps/shell/src/SimCard";
import { gamiAllResponseSchema, gamiSimSummarySchema } from "../../packages/contracts/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it, vi } from "vitest";

const count = (html: string, needle: string): number => html.split(needle).length - 1;
const STUDENT: DevSession = { actorId: "dev-student-0001", role: "student" };

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

describe("ProgressSectionView (durumsuz görünüm)", () => {
  it("yükleniyor durumunda üç iskelet satırı gösterir, sekme yoktur", () => {
    const html = renderToStaticMarkup(createElement(ProgressSectionView, baseViewProps({ status: "loading" })));
    expect(html).toContain("eg-shell-progress__skeleton");
    expect(count(html, "eg-shell-progress__skeleton-row")).toBe(SIM_IDS.length);
    expect(html).not.toContain('role="tab"');
  });

  it("hata durumunda kod + 'Yeniden dene' gösterir; düğme onRetry'ı tetikler", () => {
    const html = renderToStaticMarkup(createElement(ProgressSectionView, baseViewProps({ status: "error" })));
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain(t("home.progress.error.title"));
    expect(html).toContain(t("home.progress.error.body"));
    expect(html).toContain(t("home.progress.error.retry"));

    let retried = 0;
    const tree = ProgressSectionView(
      baseViewProps({ onRetry: () => { retried += 1; }, status: "error" }),
    ) as ReactElement;
    const [button] = collectElements(tree, (element) => element.type === "button");
    (button?.props as { onClick?: () => void } | undefined)?.onClick?.();
    expect(retried).toBe(1);
  });

  it("hazır + boş özetlerde üç sekme, her panelde boş durum metni + sim bağlantısı gösterir", () => {
    const html = renderToStaticMarkup(createElement(ProgressSectionView, baseViewProps({ status: "ready", summaries: [] })));
    expect((html.match(/role="tab"/g) ?? []).length).toBe(SIM_IDS.length);
    expect(count(html, t("home.progress.tab.empty"))).toBe(SIM_IDS.length);
    expect(count(html, t("sims.open"))).toBe(SIM_IDS.length);
    for (const id of SIM_IDS) {
      expect(html, id).toContain(`href="${simHref(id)}"`);
      expect(html, id).toContain(`>${t(`sims.${id}.name`)}</button>`);
    }
    expect(html).not.toContain("eg-shell-progress__num");
  });

  it("hazır + dolu özetlerde XP/seviye/seri/haftalık hedef/liderlik ve rozetleri gösterir", () => {
    const summaries: readonly GamiSimSummary[] = [
      {
        simId: "pulse",
        xp: 1450,
        level: 4,
        streak: { current: 3, best: 7, lastDate: "2026-09-22" },
        weeklyGoal: { targetXp: 300, currentXp: 120 },
        badges: [{ key: "ritim-ustasi", awardedAt: "2026-09-20T10:15:00.000+03:00" }],
        leaderboard: { rank: 5, total: 42 },
        attempts: [],
      },
    ];
    const html = renderToStaticMarkup(
      createElement(ProgressSectionView, baseViewProps({ status: "ready", summaries })),
    );
    expect(html).toContain("1450");
    expect(html).toContain(t("home.progress.xp"));
    expect(html).toContain(t("home.progress.level"));
    expect(html).toContain(t("home.progress.streak"));
    expect(html).toContain("120/300");
    expect(html).toContain(t("home.progress.weeklyGoal"));
    expect(html).toContain("5/42");
    expect(html).toContain(t("home.progress.leaderboard"));
    expect(html).toContain("ritim-ustasi");
    // Ausculta ve Opaca özeti taşımaz: boş durum korunur (simler arası birleştirme yok).
    expect(count(html, t("home.progress.tab.empty"))).toBe(SIM_IDS.length - 1);
  });

  it("rozetsiz dolu özette 'Henüz rozet yok' gösterir", () => {
    const summaries: readonly GamiSimSummary[] = [
      {
        simId: "ausculta",
        xp: 210,
        level: 1,
        streak: { current: 0, best: 2, lastDate: null },
        weeklyGoal: { targetXp: 150, currentXp: 0 },
        badges: [],
        leaderboard: { rank: 31, total: 58 },
        attempts: [],
      },
    ];
    const html = renderToStaticMarkup(
      createElement(ProgressSectionView, baseViewProps({ status: "ready", summaries })),
    );
    expect(html).toContain(t("home.progress.badges.empty"));
  });
});

describe("ProgressSection (kap)", () => {
  it("varsayılan (dataSource'suz) çağrıldığında ilk render'da iskelet gösterir; SSR efekt çalıştırmaz", () => {
    const html = renderToStaticMarkup(createElement(ProgressSection));
    expect(html).toContain("eg-shell-progress__skeleton");
  });

  it("enjekte edilen kaynakla da ilk render iskelet gösterir; kaynağın kendisi bağımsız çalışır", async () => {
    const source = createSyntheticGamificationSource(true);
    const html = renderToStaticMarkup(createElement(ProgressSection, { dataSource: source, session: shellSessionFromDev(STUDENT) }));
    expect(html).toContain("eg-shell-progress__skeleton");
    const summaries = await source.getSummaries();
    expect(summaries).toHaveLength(SIM_IDS.length);
  });
});
