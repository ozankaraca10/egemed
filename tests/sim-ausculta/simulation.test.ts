import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SimulationScreen,
  StoreProvider,
  createMemoryRuntimeAdapter,
  createNoopSimulationAudio,
  createNoopSimulationScreenEnv,
  initialState,
  isLastQuestion,
  planPrimaryAction,
  poolFor,
  reducer,
} from "../../packages/sim-ausculta/src/index";
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

function renderInStore(node: ReactNode, seed: Partial<AppState> = {}): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      initialState: { ...initialState, screen: "simulation", ...seed },
      now: () => 1_728_000_000_000,
      runtime: createMemoryRuntimeAdapter(),
      storage,
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
    expect(html).toContain("Oturum");
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
