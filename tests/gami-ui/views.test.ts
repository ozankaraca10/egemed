import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  GamiAchievementsView,
  GamiGainsView,
  GamiLeaderboardView,
  GamiProgressPage,
  gamiUiStyles,
  type GamiIcons,
} from "../../packages/gami-ui/src/index";

const svg = (label: string) => () => createElement("svg", { "data-icon": label });
const icons: GamiIcons = {
  award: svg("award"),
  chart: svg("chart"),
  check: svg("check"),
  checkCircle: svg("check"),
  chevronRight: svg("chevron"),
  flame: svg("flame"),
  arrowRight: svg("arrow"),
  star: svg("star"),
  target: svg("target"),
  info: svg("info"),
  close: svg("close"),
  lock: svg("lock"),
  gift: svg("gift"),
  clock: svg("clock"),
  arrowUp: svg("up"),
  book: svg("book"),
  badge: () => createElement("svg", { "data-icon": "badge" }),
};

const avatarOf = () => ({ tone: "t-blue" as const, text: "AY" });

describe("gami-ui görünüm sözleşmesi", () => {
  it("stil metni eg-gami sınıflarını ve token renklerini taşır", () => {
    expect(gamiUiStyles).toContain(".eg-gami-page");
    expect(gamiUiStyles).toContain("var(--ink-900)");
    expect(gamiUiStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(gamiUiStyles).not.toMatch(/rgba\(/);
  });

  it("sekmeli sayfa Başarılarım ve Liderlik Tahtası sekmelerini çizer", () => {
    const html = renderToStaticMarkup(createElement(GamiProgressPage, {
      active: "achievements",
      onTab: () => undefined,
      icons,
      children: "içerik",
    }));
    expect(html).toContain("Başarılarım");
    expect(html).toContain("Liderlik Tahtası");
    expect(html).toContain("eg-gami-page");
    expect(html).toContain("Demo verisi");
    expect(html).toContain("içerik");
  });

  it("boş başarı görünümü boş durum kartını çizer", () => {
    const html = renderToStaticMarkup(createElement(GamiAchievementsView, {
      title: createElement("h1", null, "Başarılarım"),
      subtitle: "ilerleme",
      period: null,
      periods: [],
      onPeriod: () => undefined,
      congrats: null,
      congratsIcon: null as ReactNode,
      hasAttempts: false,
      profile: null,
      avatarOf,
      onLeaderboard: () => undefined,
      onAssessment: () => undefined,
      points: [],
      rangeLabel: "",
      goals: null,
      goalIcon: () => null,
      doneIcon: null,
      weekLabel: "",
      domains: [],
      domainRange: "",
      badges: [],
      categories: [],
      onStudy: () => undefined,
      onScrollBadges: () => undefined,
      icons,
    }));
    expect(html).toContain("Başarılarım burada birikecek");
    expect(html).toContain("eg-gami-empty");
    expect(html).not.toContain("eg-gami-profile");
  });

  it("liderlik görünümü dönem ve boş sıralama metnini çizer", () => {
    const html = renderToStaticMarkup(createElement(GamiLeaderboardView, {
      title: createElement("h1", null, "Liderlik Tahtası"),
      subtitle: "sıra",
      reward: null,
      period: "week",
      periods: [{ id: "week", label: "Bu hafta" }],
      onPeriod: () => undefined,
      cohort: "all",
      cohorts: [{ id: "all", label: "Tüm dönemler" }],
      onCohort: () => undefined,
      periodLabel: "1–7 Eyl 2026",
      countdown: "",
      status: null,
      onTerms: () => undefined,
      onStatusAction: () => undefined,
      rankedEmpty: true,
      rows: [],
      candidates: null,
      items: [],
      meDelta: null,
      qualify: null,
      onQualify: () => undefined,
      privacy: { name: null, isPublic: false, cohort: null },
      onPrivacy: () => undefined,
      winners: [],
      terms: false,
      onCloseTerms: () => undefined,
      avatarOf,
      icons,
    }));
    expect(html).toContain("Liderlik Tahtası");
    expect(html).toContain("Bu hafta");
    expect(html).toContain("Bu dönemde henüz sıralamaya giren yok.");
    expect(html).toContain("Anonim öğrenci");
  });

  it("kazanım kartı XP ve rozet metnini çizer", () => {
    const html = renderToStaticMarkup(createElement(GamiGainsView, {
      icons,
      onAchievements: () => undefined,
      onLeaderboard: () => undefined,
      gains: {
        badge: null,
        badgeFresh: false,
        xp: 40,
        bonus: 0,
        level: 2,
        xpInto: 10,
        xpSpan: 200,
        xpToNext: 190,
        rank: null,
        confetti: false,
      },
    }));
    expect(html).toContain("Bu oturumda kazandıkların");
    expect(html).toContain("+40 XP");
    expect(html).toContain("Seviye 2");
    expect(html).toContain("Başarılarımı gör");
  });
});
