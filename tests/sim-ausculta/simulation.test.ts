import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmbeddedProvider, SimulationScreen, StoreProvider, createMemoryRuntimeAdapter, createNoopSimulationAudio, createNoopSimulationScreenEnv, initialState, isLastQuestion, planPrimaryAction, reducer } from "../../packages/sim-ausculta/src/index";
import { toClientCase } from "../../packages/sim-ausculta/src/core/serverSession";
import { ausculta } from "../../packages/assessment-bank/src/index";
import type { SimSessionSource } from "../../packages/sim-host/src/index";
import { poolFor } from "./bank-cases";
import type { AppState, StoragePort, WindowLike } from "../../packages/sim-ausculta/src/index";

/** Simülasyon ekranı — statik işaretleme ve vaka akışı. DOM kütüphanesi yok. */

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

const storage: StoragePort = {
  get: () => null,
  set: () => undefined,
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** T196: ekran yalnız sunucu oturumuyla vaka çizer; bankadan anahtarsız vaka kurulur. */
function serverStateFor(mode: "practice" | "assessment"): AppState["server"] {
  const caseDef = poolFor(mode)[0];
  if (!caseDef) throw new Error("havuz boş");
  let counter = 0;
  const { publicCase } = ausculta.buildPublicCase(caseDef as never, {
    index: 1,
    mode,
    openedAt: "2026-09-27T10:00:00.000+03:00",
    newToken: () => `tok_test${String((counter += 1)).padStart(6, "0")}`,
    random: () => 0.5,
  });
  return {
    sessionId: "00000000-0000-4000-8000-00000000abcd",
    mode,
    caseCount: 10,
    loadedIndex: 1,
    currentCase: toClientCase(publicCase, mode),
    feedback: {},
    hints: {},
    metas: {},
    snapshots: {},
    status: "ready",
    error: null,
  };
}

const fakeSessions = { audioUrl: (_id: string, token: string) => `/audio/${token}` } as unknown as SimSessionSource;

function renderInStore(node: ReactNode, seed: Partial<AppState> = {}): string {
  const mode = seed.mode === "assessment" ? "assessment" : "practice";
  return renderToStaticMarkup(
    createElement(EmbeddedProvider, {
      embedded: false,
      sessions: fakeSessions,
      children: createElement(StoreProvider, {
        children: node,
        env: inertWindow,
        initialState: { ...initialState, screen: "simulation", mode, server: serverStateFor(mode), ...seed },
        now: () => 1_728_000_000_000,
        runtime: createMemoryRuntimeAdapter(),
        storage,
      }),
    }),
  );
}

describe("SimulationScreen", () => {
  const practice = poolFor("practice")[0];

  it("olgu kartını, soruyu ve uygulama ızgarasını çizer", () => {
    expect(practice).toBeDefined();
    if (!practice) return;
    const html = renderInStore(createElement(SimulationScreen));
    expect(html).toContain("sim-grid");
    expect(html).toContain("mode-practice");
    expect(html).toContain("<h3");
    expect(html).toContain("Olgu");
    expect(html).toContain("Vaka 1/");
    expect(html).toContain(esc(practice.chiefComplaint));
    expect(html).toContain(`${practice.patient.age} yaşında`);
    expect(html).toContain(esc(practice.questions[0]?.prompt ?? ""));
    expect(html).toContain("Yanıtla");
    expect(html).toContain("Dinleme noktalarını göster");
    expect(html).toContain("Yeni oturum");
    expect(html).toContain("stage-card");
    expect(html).toContain('role="toolbar"');
    expect(html).toContain("<footer");
    expect(html).toContain("min-width:44px");
    expect(html).toContain("İpucu kullanmak uygulama puanınızı düşürür");
  });

  it("değerlendirmede manuel muayene uyarısını gösterir", () => {
    const html = renderInStore(createElement(SimulationScreen), { mode: "assessment" });
    expect(html).toContain("mode-assessment");
    expect(html).toContain("Manuel muayene modu.");
    expect(html).toContain("Sonraki soru");
    expect(html).not.toContain("Dinleme noktalarını göster");
    expect(html).not.toContain(">Oturum<");
  });

  it("T196: oturum kanalı yoksa vaka çizilmez; sunucu gerektiği söylenir", () => {
    const html = renderToStaticMarkup(
      createElement(StoreProvider, {
        children: createElement(SimulationScreen),
        env: inertWindow,
        initialState: { ...initialState, screen: "simulation", mode: "practice" },
        now: () => 1_728_000_000_000,
        runtime: createMemoryRuntimeAdapter(),
        storage,
      }),
    );
    expect(html).toContain("Bu mod için sunucu bağlantısı gerekir");
    expect(html).not.toContain("sim-grid");
  });

  it("gömülü modda footer ve arka plan çizilmez", () => {
    const html = renderInStore(createElement(SimulationScreen, { embedded: true }));
    expect(html).not.toContain("<footer");
    expect(html).not.toContain('class="app-bg"');
    expect(html).toContain("Olgu");
  });

  it("ses ve belge sınırları no-op ile güvenli çalışır", () => {
    const env = createNoopSimulationScreenEnv();
    const audio = createNoopSimulationAudio();
    expect(() => env.addEventListener("mousedown", () => undefined)).not.toThrow();
    expect(() => audio.stop()).not.toThrow();
    const html = renderInStore(createElement(SimulationScreen, { env, audio }));
    expect(html).toContain("sim-grid");
  });

  it("uygulamada yanıt önce açılır, sonra vakayı bitirir", () => {
    const caseDef = poolFor("practice")[0];
    expect(caseDef).toBeDefined();
    if (!caseDef) return;
    const question = caseDef.questions[0];
    expect(question).toBeDefined();
    if (!question) return;
    const seam = { emit: () => undefined };
    let state = reducer({ ...initialState, mode: "practice", screen: "simulation" }, { type: "caseMount", caseDef }, seam);
    state = reducer(state, { type: "answer", qid: question.id, values: [...question.correct] }, seam);
    const submit = planPrimaryAction({
      mode: "practice",
      question,
      questions: caseDef.questions,
      revealed: false,
      canSubmit: true,
      given: question.correct,
      shownAt: { [question.id]: 100 },
      now: 500,
    });
    for (const action of submit.dispatches) state = reducer(state, action, seam);
    expect(state.revealed[question.id]).toBe(true);
    const last = isLastQuestion(caseDef.questions, question);
    const next = planPrimaryAction({
      mode: "practice",
      question,
      questions: caseDef.questions,
      revealed: true,
      canSubmit: true,
      given: question.correct,
      shownAt: { [question.id]: 100 },
      now: 800,
    });
    expect(next.dispatches).toEqual([last ? { type: "finishCase" } : { type: "advance" }]);
  });
});
