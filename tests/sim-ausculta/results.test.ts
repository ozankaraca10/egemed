import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BEST_SCORE_KEY, EmbeddedProvider, LocalGamiRepository, MASTERY_THRESHOLD, ResultsScreen, StoreProvider, buildSuspend, createMemoryRuntimeAdapter, createNoopResultsScreenEnv, createSimRuntime, exitResults, firstWeakLibraryKeyFromServer, gamiStoragePort, initialState, sessionSeed, studyLearnFromResults } from "../../packages/sim-ausculta/src/index";
import { poolFor } from "./bank-cases";
import type { SimAudience } from "../../packages/sim-host/src/index";
import type { AppState, CaseResult, ScoringWeights, StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";

/** Sonuç ekranı — statik işaretleme ve terminate seam. DOM kütüphanesi yok. */

const NOW = 1_728_000_000_000;

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function trackingStorage(seed: Record<string, string> = {}): StoragePort & { entries: Map<string, string> } {
  const entries = new Map(Object.entries(seed));
  return {
    entries,
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

function domains(partial: Partial<Record<keyof ScoringWeights, { earned: number; max: number }>>): CaseResult["domains"] {
  const zero = { earned: 0, max: 0 };
  return {
    technique: partial.technique ?? { earned: 20, max: 20 },
    localization: partial.localization ?? { earned: 20, max: 20 },
    recognition: partial.recognition ?? { earned: 25, max: 25 },
    interpretation: partial.interpretation ?? { earned: 20, max: 20 },
    diagnosis: partial.diagnosis ?? zero,
    systematic: partial.systematic ?? { earned: 5, max: 5 },
  };
}

function resultFor(mode: "practice" | "assessment", mastery: boolean): CaseResult {
  const caseDef = poolFor(mode)[0];
  if (!caseDef) throw new Error("havuz boş");
  const question = caseDef.questions[0];
  return {
    caseId: caseDef.id,
    total: mastery ? 92 : 40,
    max: 100,
    mastery,
    domains: domains(
      mastery
        ? {}
        : {
            localization: { earned: 4, max: 20 },
            recognition: { earned: 5, max: 25 },
          },
    ),
    answers: question
      ? [{ qid: question.id, correct: mastery, given: question.correct.length ? [question.correct[0] ?? ""] : [] }]
      : [],
    hintsUsed: mastery ? 0 : 2,
  };
}

function renderResults(
  seed: Partial<AppState>,
  storage = trackingStorage(),
  props: { embedded?: boolean; env?: ReturnType<typeof createNoopResultsScreenEnv> } = {},
): { html: string; storage: StoragePort & { entries: Map<string, string> } } {
  const html = renderToStaticMarkup(
    createElement(StoreProvider, {
      children: createElement(ResultsScreen, props) as ReactNode,
      env: inertWindow,
      initialState: { ...initialState, screen: "results", ...seed },
      now: () => NOW,
      runtime: createMemoryRuntimeAdapter(),
      storage,
    }),
  );
  return { html, storage };
}

describe("ResultsScreen", () => {
  it("uygulama raporunu, zayıf alanı ve en iyi puanı çizer", () => {
    const storage = trackingStorage({ [BEST_SCORE_KEY]: '{"practice":88,"assessment":0}' });
    const caseDef = poolFor("practice")[0];
    // T196: vaka başlığı istemci havuzundan değil, sunucu sonuç meta verisinden gelir.
    const server = {
      snapshots: {},
      metas: { [caseDef?.id ?? ""]: { title: caseDef?.title ?? "", diagnosis: null, summary: "" } },
    } as unknown as AppState["server"];
    const { html } = renderResults({ mode: "practice", caseResults: [resultFor("practice", false)], assessmentTimer: 125_000, server }, storage);
    expect(html).toContain("Vaka Raporu");
    expect(html).toContain("Hedefin altında");
    expect(html).toContain("Durum (eşik 80)");
    expect(html).toContain("Alan bazlı performans");
    expect(html).toContain("Oskültasyon tekniği");
    expect(html).toContain("Ses tanımlama");
    expect(html).toContain("Zayıf alanlar");
    expect(html).toContain("Lokalizasyon");
    expect(html).toContain("Vaka raporu");
    expect(html).toContain(esc(caseDef?.title ?? ""));
    expect(html).toContain("40/100");
    expect(html).toContain("Başarısız");
    expect(html).toContain("En iyi puan (bu mod)");
    expect(html).toContain(">88<");
    expect(html).not.toContain("Toplam öğrenme süresi");
    expect(html).toContain("Modülden Çık");
    expect(html).toContain("Tekrar dene");
    expect(html).toContain("Öğrenme modunda çalış");
    expect(html).toContain("min-width:44px");
    expect(html).toContain("<footer");
    expect(MASTERY_THRESHOLD).toBe(80);
  });

  it("kazanım kartı yalnız öğrenci kitlesinde çizilir (T174)", () => {
    const renderWithAudience = (audience: SimAudience): string => {
      const repository = new LocalGamiRepository({ storage: gamiStoragePort(trackingStorage()), now: () => new Date(NOW) });
      return renderToStaticMarkup(
        createElement(StoreProvider, {
          children: createElement(EmbeddedProvider, {
            embedded: true,
            audience,
            children: createElement(ResultsScreen, { embedded: true, repository }),
          }) as ReactNode,
          env: inertWindow,
          initialState: {
            ...initialState,
            screen: "results",
            mode: "assessment",
            caseResults: [resultFor("assessment", true)],
            assessmentTimer: 90_000,
          },
          now: () => NOW,
          runtime: createMemoryRuntimeAdapter(),
          storage: trackingStorage(),
        }),
      );
    };
    expect(renderWithAudience("student")).toContain("eg-gami-gains");
    expect(renderWithAudience("faculty")).not.toContain("eg-gami-gains");
    expect(renderWithAudience("visitor")).not.toContain("eg-gami-gains");
  });

  it("çıkış seam'i LMS'e bağlı değildir ve işaretlemede öğrenci adı yoktur", () => {
    const env = createNoopResultsScreenEnv();
    expect(env.lmsAttached).toBe(false);
    const { html, storage } = renderResults({ mode: "practice", caseResults: [resultFor("practice", true)] }, trackingStorage(), {
      env,
    });
    expect(html).not.toMatch(/learner_name|learner_id|Öğrenci Adı|displayName/i);
    for (const value of storage.entries.values()) {
      expect(value).not.toMatch(/learner_name|learner_id|Öğrenci Adı|displayName/i);
    }
    expect(sessionSeed(NOW)).toBe((NOW % 2147483647) | 0);
  });
});

describe("öğrenme odağı (T214)", () => {
  it("yanlış yanıtlı vakanın sunucu kütüphane anahtarı setLearnFocus ile kurulur", () => {
    const weak = { ...resultFor("practice", false), caseId: "srv-1" };
    const weakLearnKey = firstWeakLibraryKeyFromServer([weak], { "srv-1": { libraryKey: "heart.normal" } });
    expect(weakLearnKey).toBe("heart.normal");
    const dispatch = vi.fn();
    const startMode = vi.fn(() => true);
    studyLearnFromResults({ weakLearnKey, startMode, dispatch });
    expect(dispatch).toHaveBeenCalledWith({ type: "setLearnFocus", key: "heart.normal" });
    expect(startMode).toHaveBeenCalledWith("learn");
    expect(dispatch).toHaveBeenCalledWith({ type: "goto", screen: "learn" });
  });

  it("zayıf konu yoksa odak kurulmaz, yalnız öğrenmeye geçilir (T209 kilidi korunur)", () => {
    const dispatch = vi.fn();
    const startMode = vi.fn(() => true);
    studyLearnFromResults({ weakLearnKey: null, startMode, dispatch });
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "setLearnFocus" }));
    expect(startMode).toHaveBeenCalledWith("learn");
    expect(dispatch).toHaveBeenCalledWith({ type: "goto", screen: "learn" });
  });
});

describe("terminate seam", () => {
  it("LMS bağlıyken bir kez terminate eder ve kapatmayı ister; bağlı değilken ikisini de yapmaz", () => {
    const adapter = createMemoryRuntimeAdapter();
    const runtime = createSimRuntime({
      adapter,
      getSuspend: () => buildSuspend(initialState),
      totalCases: () => 1,
      now: () => NOW,
    });
    const requestClose = vi.fn();
    const dispatch = vi.fn();
    exitResults({
      env: { lmsAttached: true, requestClose },
      runtime,
      dispatch,
    });
    expect(runtime.terminated).toBe(true);
    expect(adapter.finished).not.toBeNull();
    expect(adapter.calls.filter((call) => call.type === "finish")).toHaveLength(1);
    expect(requestClose).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "goto", screen: "start" });

    exitResults({
      env: { lmsAttached: true, requestClose },
      runtime,
      dispatch,
    });
    expect(adapter.calls.filter((call) => call.type === "finish")).toHaveLength(1);
    expect(requestClose).toHaveBeenCalledTimes(2);

    const detached = createSimRuntime({
      adapter: createMemoryRuntimeAdapter(),
      getSuspend: () => buildSuspend(initialState),
      totalCases: () => 1,
      now: () => NOW,
    });
    const closeDetached = vi.fn();
    exitResults({
      env: { lmsAttached: false, requestClose: closeDetached },
      runtime: detached,
      dispatch,
    });
    expect(detached.terminated).toBe(false);
    expect(closeDetached).not.toHaveBeenCalled();
  });
});
