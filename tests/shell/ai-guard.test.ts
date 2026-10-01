import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AI_GUARD_CLEAR,
  AI_GUARD_GRACE_MS,
  aiGuardSecondsLeft,
  aiGuardStep,
  detectAiAgents,
  isCompetitiveHash,
  type AiGuardEnvironment,
} from "../../apps/shell/src/integrity/aiGuard";
import { AiGuardOverlay } from "../../apps/shell/src/integrity/AiGuardOverlay";

// T283f: rekabetçi ekranda yerel yapay zekâ ajanı tespiti — 10 sn kapatma süresi,
// süre dolunca engel, ajan kapanınca kendiliğinden açılma.

function env(selectors: readonly string[]): AiGuardEnvironment {
  return {
    querySelector: (selector) => (selectors.includes(selector) ? {} : null),
    hash: () => "#/sims/opaca/degerlendirme",
  };
}

describe("yapay zekâ ajanı tespiti", () => {
  it("temiz sayfada sinyal yok; Claude ajan kaplaması sinyal verir", () => {
    expect(detectAiAgents(env([]))).toEqual([]);
    expect(detectAiAgents(env(['[id^="claude-agent-"]']))).toEqual(["claude-in-chrome"]);
  });

  it("yalnız XP kazandıran ekranlar rekabetçidir: değerlendirme ve karşılaşma oynanışı", () => {
    expect(isCompetitiveHash("#/sims/opaca/degerlendirme")).toBe(true);
    expect(isCompetitiveHash("#/sims/pulse/duello/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isCompetitiveHash("#/sims/opaca/modlar")).toBe(false);
    expect(isCompetitiveHash("#/sims/opaca/uygulama")).toBe(false);
    expect(isCompetitiveHash("#/sims/opaca/meydan-okuma")).toBe(false);
  });

  it("uyarı 10 sn sürer, süre dolunca engel; ajan kapanınca her durumdan temize döner", () => {
    const warning = aiGuardStep(AI_GUARD_CLEAR, ["claude-in-chrome"], 1_000);
    expect(warning.kind).toBe("warning");
    expect(aiGuardSecondsLeft(warning, 1_000)).toBe(10);
    expect(aiGuardSecondsLeft(warning, 4_500)).toBe(7);

    const stillWarning = aiGuardStep(warning, ["claude-in-chrome"], 1_000 + AI_GUARD_GRACE_MS - 1);
    expect(stillWarning.kind).toBe("warning");
    const blocked = aiGuardStep(stillWarning, ["claude-in-chrome"], 1_000 + AI_GUARD_GRACE_MS);
    expect(blocked.kind).toBe("blocked");

    expect(aiGuardStep(warning, [], 2_000)).toBe(AI_GUARD_CLEAR);
    expect(aiGuardStep(blocked, [], 60_000)).toBe(AI_GUARD_CLEAR);
  });

  it("kaplama: temizken çizilmez; uyarıda geri sayım ve gizlilik notu, engelde geri sayım yok", () => {
    expect(renderToStaticMarkup(createElement(AiGuardOverlay, { state: AI_GUARD_CLEAR, now: 0 }))).toBe("");
    const warningHtml = renderToStaticMarkup(
      createElement(AiGuardOverlay, { state: { kind: "warning", signals: ["claude-in-chrome"], since: 0 }, now: 3_000 }),
    );
    expect(warningHtml).toContain('role="alertdialog"');
    expect(warningHtml).toContain("7 sn");
    expect(warningHtml).toContain("hiçbir bilgi gönderilmez");
    const blockedHtml = renderToStaticMarkup(createElement(AiGuardOverlay, { state: { kind: "blocked", signals: ["claude-in-chrome"] }, now: 0 }));
    expect(blockedHtml).toContain("Ekran duraklatıldı");
    expect(blockedHtml).not.toContain(" sn");
  });
});
