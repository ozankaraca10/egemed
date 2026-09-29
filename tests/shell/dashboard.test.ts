import { createElement, type ReactElement } from "react";
import { shellSessionFromDev } from "../../apps/shell/src/session";
import { renderToStaticMarkup } from "react-dom/server";
import type { DevSession } from "../../apps/shell/src/devAuth";
import { createSyntheticGamificationSource, type GamiSimSummary } from "../../apps/shell/src/home/gamificationSource";
import {
  ProgressSection,
  ProgressSectionView,
  usesBadgeCatalog,
  type ProgressSectionViewProps,
} from "../../apps/shell/src/home/ProgressSection";
import { SIM_IDS } from "../../apps/shell/src/SimCard";
import { gamiSimSummarySchema } from "../../packages/contracts/src/index";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it, vi } from "vitest";
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
    expect(summaries.map(({ simId, xp }) => ({ simId, xp }))).toEqual([
      { simId: "pulse", xp: 1450 },
      { simId: "ausculta", xp: 210 },
      { simId: "opaca", xp: 320 },
    ]);
    expect(summaries.find((summary) => summary.simId === "pulse")?.badges[0]?.key).toBe("rhythm-streak-3");
    expect(summaries.find((summary) => summary.simId === "opaca")?.badges[0]?.key).toBe("first-step");
    for (const summary of summaries) {
      expect(() => gamiSimSummarySchema.parse(summary), summary.simId).not.toThrow();
    }
  });

  it("gerçek zamanı okumaz", async () => {
    const source = createSyntheticGamificationSource(true);
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

describe("ProgressSectionView (durumsuz görünüm)", () => {

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

describe("usesBadgeCatalog: API oturumu kararı (T114)", () => {
  it("sahte oturum ve oturumsuz durumda katalog görünümü kapalıdır", () => {
    expect(usesBadgeCatalog(shellSessionFromDev(STUDENT))).toBe(false);
    expect(usesBadgeCatalog(null)).toBe(false);
  });
});

describe("ProgressSectionView: sunucu rozet kataloğu (T114, ADR-008 S4)", () => {
  const pulseSummary: GamiSimSummary = {
    simId: "pulse",
    xp: 60,
    level: 2,
    streak: { current: 10, best: 10, lastDate: "2026-09-24" },
    weeklyGoal: { targetXp: 300, currentXp: 60 },
    badges: [
      { key: "rhythm-streak-3", awardedAt: "2026-09-20T10:15:00.000+03:00" },
      { key: "bilinmeyen-anahtar", awardedAt: "2026-09-21T10:15:00.000+03:00" },
    ],
    leaderboard: { rank: 5, total: 42 },
    attempts: [],
  };

  it("rozet adı/kısa açıklama/kazanılma tarihi katalogdan gelir; sayacı katalog uzunluğuyla yazar", () => {
    const html = renderToStaticMarkup(
      createElement(
        ProgressSectionView,
        baseViewProps({ status: "ready", badgeCatalog: true, summaries: [pulseSummary] }),
      ),
    );
    expect(html).toContain("Ritim izleyicisi");
    expect(html).toContain("3 EKG örüntüsünü art arda doğru tanı.");
    expect(html).toContain(t("home.progress.badges.awarded"));
    expect(html).toContain("20 Eyl 2026");
    expect(html).toContain("eg-gami-profile");
    expect(html).toContain("data-xp=\"60\"");
    // Ham anahtarlar gösterilmez; katalogda olmayan anahtar sessizce atlanır.
    expect(html).not.toContain("rhythm-streak-3");
    expect(html).not.toContain("bilinmeyen-anahtar");
  });

  it("hiçbir anahtar katalogda yoksa boş durum gösterir, sayaç çizmez", () => {
    const unknownOnly: GamiSimSummary = { ...pulseSummary, badges: pulseSummary.badges };
    const html = renderToStaticMarkup(
      createElement(
        ProgressSectionView,
        baseViewProps({ status: "ready", badgeCatalog: true, summaries: [{ ...unknownOnly, badges: [{ key: "yok-boyle", awardedAt: "2026-09-20T10:15:00.000+03:00" }] }] }),
      ),
    );
    expect(html).toContain(t("home.progress.badges.empty"));
    expect(html).not.toContain("eg-shell-progress__badgeCount");
  });

  it("rozetsiz özette katalog modunda da 'Henüz rozet yok' gösterir", () => {
    const html = renderToStaticMarkup(
      createElement(
        ProgressSectionView,
        baseViewProps({ status: "ready", badgeCatalog: true, summaries: [{ ...pulseSummary, badges: [] }] }),
      ),
    );
    expect(html).toContain(t("home.progress.badges.empty"));
    expect(html).not.toContain("eg-shell-progress__badgeCount");
  });

  it("katalog dışı anahtar sahte görünümde de atlanır; katalog adı görünür", () => {
    const html = renderToStaticMarkup(
      createElement(ProgressSectionView, baseViewProps({ status: "ready", summaries: [pulseSummary] })),
    );
    expect(html).toContain("Ritim izleyicisi");
    expect(html).not.toContain("rhythm-streak-3");
    expect(html).not.toContain("bilinmeyen-anahtar");
    expect(html).not.toContain("eg-shell-progress__badgeCount");
  });
});

describe("ProgressSection (kap)", () => {

  it("enjekte edilen kaynakla da ilk render iskelet gösterir; kaynağın kendisi bağımsız çalışır", async () => {
    const source = createSyntheticGamificationSource(true);
    const html = renderToStaticMarkup(createElement(ProgressSection, { dataSource: source, session: shellSessionFromDev(STUDENT) }));
    expect(html).toContain("eg-shell-progress__skeleton");
    const summaries = await source.getSummaries();
    expect(summaries).toHaveLength(SIM_IDS.length);
  });
});
