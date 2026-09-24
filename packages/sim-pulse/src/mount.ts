import type { SimDispose, SimModule, SimMountContext, SimMountTarget } from "@egemed/sim-host";
import "@egemed/tokens/family-tokens.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/sim.css";
import "./styles/explain.css";
import "./styles/case.css";
import "./styles/responsive.css";
import { PULSE_MODE_CONTENT } from "./data/content";
import { curriculum } from "./data/curriculum";
import { applyMode, showView } from "./engine/actions";
import { createPulseController } from "./engine/controller";
import type { PulseController } from "./engine/controller";
import { CardiacModel } from "./engine/model";
import { createSeededRandomInt } from "./engine/rng";
import type { PulseSchedulerOptions } from "./engine/scheduler";
import { blank, decode, encode } from "./engine/state";
import type { PulseState, StateContext } from "./engine/state";
import { MODES } from "./engine/shapes";
import type { Mode } from "./engine/shapes";
import { createPulseEventEmitter } from "./host/events";
import type { AbortControllerLike, EventListenerLike, ListenerTarget } from "./host/lifecycle";
import { createPulseLifecycle } from "./host/lifecycle";
import { createLocalStoragePersistence } from "./persistence/localStorage";
import type { PersistencePort, PersistenceStorage } from "./persistence/types";
import { createPulseAboutView, renderPulseAboutMarkup } from "./ui/about";
import { createCaseQuestionView, caseQuestionCardMarkup } from "./ui/case";
import { heartMarkup } from "./ui/sim/heartMarkup";
import { MODE_CARDS } from "./ui/modes";
import { createQuizQuestionView, quizQuestionCardMarkup } from "./ui/quiz";
import { createTutorialStepViews } from "./ui/tutorial";
import { drawEcg } from "./ui/sim/ecg";
import type { EcgCanvasContext, EcgResizeObserver } from "./ui/sim/ecg";

export const DEFAULT_PULSE_ASSET_BASE = "/sims/pulse/";

export interface PulseMountElement extends ListenerTarget {
  className: string;
  innerHTML: string;
  readonly dataset: Record<string, string | undefined>;
  querySelector(selector: string): unknown;
  remove(): void;
}

export interface PulseModuleEnv extends PulseSchedulerOptions {
  createElement(): PulseMountElement;
  createAbortController(): AbortControllerLike;
  createResizeObserver?(): EcgResizeObserver;
  readonly storage: PersistenceStorage;
}

export interface PulseModuleDeps {
  readonly env: PulseModuleEnv;
  readonly assetBase?: string;
  readonly persistence?: PersistencePort;
}

interface PulseClickEvent {
  readonly target: { readonly dataset?: Record<string, string | undefined> } | null;
  preventDefault(): void;
}

interface PulseChangeEvent {
  readonly target: { readonly name?: string; readonly value?: string } | null;
}

interface PulseCanvas {
  width: number;
  height: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
  getContext(kind: "2d"): EcgCanvasContext | null;
}

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const stateCurriculum: StateContext["curriculum"] = {
  version: curriculum.version,
  cases: curriculum.cases.map(({ id }) => id),
  questions: curriculum.questions.map(({ id }) => id),
  byId: curriculum.byId,
};

function appMarkup(state: PulseState, assetBase: string): string {
  const nav = ["modes", "sim", "case", "quiz", "about"].map((view) =>
    `<button type="button" class="eg-navbtn" data-pulse-view="${view}" aria-pressed="${state.activeView === view}">${
      ({ modes: "Modlar", sim: "İnceleme", case: "Uygulama", quiz: "Değerlendirme", about: "Hakkında" } as const)[view as "modes"]
    }</button>`,
  ).join("");
  return `<div class="app" data-mode="${state.mode}"><header class="topbar"><strong>EGEMED Pulse™</strong><nav aria-label="Pulse bölümleri">${nav}</nav></header><main>${screenMarkup(state, assetBase)}</main><footer class="eg-footer">Sinyaller sentetiktir · klinik tanı için kullanılmaz</footer></div>`;
}

function screenMarkup(state: PulseState, assetBase: string): string {
  if (state.activeView === "modes") {
    const cards = MODE_CARDS.map((card) => `<article class="mode-card ${card.id}"><h3>${card.title}</h3><p class="desc">${card.description}</p><ul>${card.features.map((feature) => `<li><span class="ck">✓</span>${feature}</li>`).join("")}</ul><button class="btn" type="button" data-pulse-view="${card.view}">${card.title}</button></article>`).join("");
    return `<section class="view secondary-view modes-view"><h1>Çalışma Modunu Seçin</h1><p class="honesty-banner">Tüm sinyaller sentetik öğretim şemalarıdır.</p><div class="mode-cards">${cards}</div></section>`;
  }
  if (state.activeView === "sim") {
    const content = PULSE_MODE_CONTENT[state.mode];
    const tabs = MODES.map((mode) => `<button type="button" class="rhythm-tab" data-pulse-mode="${mode}" aria-pressed="${mode === state.mode}">${escapeHtml(PULSE_MODE_CONTENT[mode].title)}</button>`).join("");
    return `<section class="view active-view"><nav class="rhythm-tabs" aria-label="EKG sonuçları">${tabs}</nav><div class="workspace"><article class="panel anatomy-panel"><h1>${escapeHtml(content.title)}</h1><div class="anatomy-stage">${heartMarkup("fill")}</div></article><article class="panel ecg-panel"><canvas class="ecg-canvas" data-pulse-ecg aria-label="Üç derivasyonlu sentetik EKG"></canvas><p data-pulse-status aria-live="polite"></p></article><article class="panel explanation-panel"><h2>${escapeHtml(content.label)}</h2><p>${escapeHtml(content.summary)}</p><ul>${content.clues.map((clue) => `<li>${escapeHtml(clue)}</li>`).join("")}</ul></article></div></section>`;
  }
  if (state.activeView === "case") {
    const item = curriculum.byId[state.caseSession.ids[state.currentCase] ?? ""] ?? curriculum.cases[0]!;
    const view = createCaseQuestionView(item, state.caseAnswers[state.currentCase] ?? null, state.caseSubmitted[state.currentCase] === true);
    return `<section class="view secondary-view case-view"><h1>Uygulama</h1>${caseQuestionCardMarkup(item, view, { last: state.currentCase === 9 })}</section>`;
  }
  if (state.activeView === "quiz") {
    const item = curriculum.byId[state.quizSession.ids[state.quizPage] ?? ""] ?? curriculum.questions[0]!;
    const view = createQuizQuestionView(item, state.answers[state.quizPage] ?? null, state.quizSubmitted[state.quizPage] === true);
    return `<section class="view secondary-view quiz-view"><h1>Değerlendirme</h1>${quizQuestionCardMarkup(item, view, { index: state.quizPage, total: 10, last: state.quizPage === 9 })}</section>`;
  }
  if (state.activeView === "about") {
    const about = createPulseAboutView({ curriculumLimitations: curriculum.limitations, assetBase });
    return `<section class="view secondary-view about-view"><h1>EGEMED Pulse™ Hakkında</h1>${renderPulseAboutMarkup(about)}</section>`;
  }
  if (state.activeView === "tutorial") {
    const steps = createTutorialStepViews(0).map((step) => `<li data-status="${step.status}"><h2>${escapeHtml(step.title)}</h2><p>${escapeHtml(step.description)}</p></li>`).join("");
    return `<section class="view secondary-view tutorial-view"><h1>Simülatörü tanıyalım</h1><ol>${steps}</ol></section>`;
  }
  return `<section class="view secondary-view results-view"><h1>Değerlendirme Sonuçları</h1><p>Puan: ${state.score ?? 0}</p></section>`;
}

function productionEnv(): PulseModuleEnv {
  const browser = globalThis as unknown as {
    AbortController: new () => AbortControllerLike;
    document: { hidden: boolean; createElement(tag: string): PulseMountElement };
    localStorage: PersistenceStorage;
    requestAnimationFrame(callback: () => void): number;
    cancelAnimationFrame(handle: number): void;
    setInterval(callback: () => void, milliseconds: number): number;
    clearInterval(handle: number): void;
    performance: { now(): number };
    ResizeObserver: new (callback: () => void) => { observe(target: unknown): void; disconnect(): void };
  };
  return {
    createElement: () => browser.document.createElement("div"),
    createAbortController: () => new browser.AbortController(),
    createResizeObserver: () => {
      let observer: { observe(target: unknown): void; disconnect(): void } | null = null;
      return {
        observe(target, onResize) { observer = new browser.ResizeObserver(onResize); observer.observe(target); },
        disconnect() { observer?.disconnect(); observer = null; },
      };
    },
    storage: browser.localStorage,
    requestFrame: (callback) => browser.requestAnimationFrame(callback),
    cancelFrame: (handle) => browser.cancelAnimationFrame(handle),
    now: () => browser.performance.now(),
    setInterval: (callback, milliseconds) => browser.setInterval(callback, milliseconds),
    clearInterval: (handle) => browser.clearInterval(handle),
    isHidden: () => browser.document.hidden,
  };
}

export function createPulseModule(deps?: PulseModuleDeps): SimModule {
  return {
    id: "pulse",
    mount(target: SimMountTarget, context: SimMountContext): SimDispose {
      const env = deps?.env ?? productionEnv();
      const root = env.createElement();
      root.className = "eg-sim-pulse";
      root.dataset.assetBase = deps?.assetBase ?? DEFAULT_PULSE_ASSET_BASE;
      target.appendChild(root);

      const lifecycle = createPulseLifecycle(env.createAbortController());
      const events = createPulseEventEmitter();
      const persistence = deps?.persistence ?? createLocalStoragePersistence(env.storage);
      const stateContext: StateContext = { curriculum: stateCurriculum, randomInt: createSeededRandomInt(Math.trunc(context.now())) };
      const loaded = persistence.load();
      const state = loaded.ok && loaded.value !== null ? decode(loaded.value, stateContext) : blank(stateContext);
      state.activeView = "modes"; // Embedded platform mount landing'i atlar.
      let controller: PulseController | null = null;
      let activeModel: CardiacModel | null = null;
      let screenObserver: EcgResizeObserver | null = null;
      let disposed = false;

      const drawCurrent = (): void => {
        if (!activeModel) return;
        const snapshot = activeModel.snapshot(state.time);
        root.dataset.phase = snapshot.phase;
        const status = root.querySelector("[data-pulse-status]") as { textContent: string } | null;
        if (status) status.textContent = `${snapshot.electrical} · ${snapshot.mechanical}`;
        const canvas = root.querySelector("[data-pulse-ecg]") as PulseCanvas | null;
        const drawing = canvas?.getContext("2d");
        if (!canvas || !drawing) return;
        canvas.width = Math.max(1, canvas.clientWidth);
        canvas.height = Math.max(1, canvas.clientHeight);
        drawEcg({ context: drawing, width: canvas.width, height: canvas.height, time: state.time,
          leads: state.leads, activeColumn: state.activeLead, source: activeModel, compare: state.compare });
      };
      const render = (): void => {
        screenObserver?.disconnect(); screenObserver = null;
        root.innerHTML = appMarkup(state, root.dataset.assetBase ?? DEFAULT_PULSE_ASSET_BASE);
        const canvas = root.querySelector("[data-pulse-ecg]");
        if (canvas && env.createResizeObserver) {
          screenObserver = env.createResizeObserver();
          screenObserver.observe(canvas, drawCurrent);
        }
        drawCurrent();
      };
      const startController = (): void => {
        controller?.dispose();
        const model = new CardiacModel(state.mode, { afProfile: state.afProfile });
        activeModel = model;
        controller = createPulseController({
          state,
          model,
          scheduler: env,
          onFrame: drawCurrent,
        });
        controller.observeMode(state.mode);
        controller.start();
      };
      const persist = (): void => { void persistence.save(encode(state, stateContext)); };
      const answerCase = (action: string): void => {
        const index = state.currentCase;
        if (action === "check" && state.caseAnswers[index] !== null) state.caseSession.submitted[index] = true;
        if (action === "continue") state.currentCase = index === 9 ? 0 : index + 1;
      };
      const answerQuiz = (action: string): void => {
        const index = state.quizPage;
        if (action === "submit" && state.answers[index] !== null) state.quizSession.submitted[index] = true;
        if (action === "next") state.quizPage = Math.min(9, index + 1);
        if (action === "prev") state.quizPage = Math.max(0, index - 1);
        if (action === "results") state.activeView = "results";
      };
      const onClick = ((event: PulseClickEvent): void => {
        const view = event.target?.dataset?.pulseView;
        const mode = event.target?.dataset?.pulseMode;
        const caseAction = event.target?.dataset?.caseAction;
        const quizAction = event.target?.dataset?.quizAction;
        if (view !== undefined) {
          event.preventDefault();
          const active = showView(state, { events, ...(controller ? { controller } : {}) }, view);
          if (active === "sim") startController();
          render(); persist();
        } else if (mode !== undefined && (MODES as readonly string[]).includes(mode)) {
          event.preventDefault();
          applyMode(state, mode as Mode, { events });
          startController(); render(); persist();
        } else if (caseAction !== undefined) {
          event.preventDefault(); answerCase(caseAction); render(); persist();
        } else if (quizAction !== undefined) {
          event.preventDefault(); answerQuiz(quizAction); render(); persist();
        }
      }) as unknown as EventListenerLike;
      const onChange = ((event: PulseChangeEvent): void => {
        const value = Number(event.target?.value);
        if (!Number.isInteger(value) || value < 0 || value > 4) return;
        if (event.target?.name === "activeCase") state.caseSession.answers[state.currentCase] = value;
        if (event.target?.name === "activeQuiz") state.quizSession.answers[state.quizPage] = value;
        render(); persist();
      }) as unknown as EventListenerLike;
      lifecycle.listen(root, "click", onClick);
      lifecycle.listen(root, "change", onChange);
      render();

      return () => {
        if (disposed) return;
        disposed = true;
        controller?.dispose();
        screenObserver?.disconnect();
        lifecycle.dispose();
        events.clear();
        root.remove();
      };
    },
  };
}

export const pulseModule: SimModule = createPulseModule();
