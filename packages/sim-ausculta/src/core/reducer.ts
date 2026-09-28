import type { CaseDef, CaseResult, Mode, PatientView, Screen, StethHead, SuspendPayload, Telemetry } from "./types";
import type { SimEventDraft } from "./events";
import { aggregateResults, practiceAdjusted, scoreCase, MASTERY_THRESHOLD } from "./scoring";
import type { ServerCaseMeta, ServerCaseSnapshot, ServerClientCase, ServerQuestionFeedback, ServerSessionState } from "./serverSession";

/** Ausculta durum iskeleti ve saf reducer (kaynak: `core/store.tsx:106-299`, `buildSuspend`).
 *  React/DOM importu yoktur; `Date.now()` kullanılmaz. Yamalar şu iki sınırla dışarı açılır:
 *  - olay yayını `ReducerSeam.emit` ile gelir; zaman damgasını `createBus(now)` vurur;
 *  - cihaz-yerel en iyi puan `StoragePort` arkasındadır (K-P3 kararı açık).
 *  Sağlanmayan sınır no-op'a düşer, böylece reducer saf kalır: aynı girdi → aynı çıktı. */

export type BodySex = "kadin" | "erkek" | "pediatrik";

export interface AppState {
  screen: Screen;
  /** aktif vaka — oturum havuzuyla tutarlı tek doğruluk kaynağı (§24) */
  currentCaseId: string;
  /** hasta gövde cinsiyeti (vakadan gelir; öğrenme modunda değiştirilebilir) */
  bodySex: BodySex;
  mode: Mode;
  caseIndex: number;
  step: number;
  answers: Record<string, string[]>;
  revealed: Record<string, boolean>;
  hintsUsed: number;
  attempts: number;
  caseResults: CaseResult[];
  telemetry: Telemetry;
  view: PatientView;
  head: StethHead;
  volume: number;
  showPoints: boolean;
  showLabels: boolean;
  tutorialDone: boolean;
  /** öğretici bu oturumda bir kez görüldü/atlandı — kalıcı değil (kalıcı: tutorialDone) */
  tutorialSeen: boolean;
  tutorialStep: number;
  assessmentTimer: number;
  lastFeedback: { correct: boolean; qid: string } | null;
  dragStarted: boolean;
  /** oturum örneklemi (rastgele 10 vaka) — suspend ile korunur */
  session: { practiceIds: string[]; assessmentIds: string[]; seed: number };
  /** vaka bitince finishCase ile hesaplanır, nextCase ile temizlenir. */
  pendingSummary: CaseResult | null;
  /** Sonuçlar ekranındaki "Öğrenme modunda çalış" için tek seferlik kütüphane anahtarı. */
  learnFocusKey: string | null;
  /** A4: mod başına kalıcı en iyi toplam puan. `StoragePort` ile okunur/yazılır (K-P3 açık);
   *  oturum sıfırlansa da silinmez. SCORM suspend şemasına dahil değildir. */
  bestScore: { practice: number; assessment: number };
  /** A1.4 (ADR-009): sunucu vaka oturumu; null ise oturum yok (öğrenme ya da henüz başlamadı). */
  server: ServerSessionState | null;
  /** Öğrenme ekranından "bu bulguda çalış": sonraki uygulama oturumunun odak bulgusu. */
  serverFocus: string | null;
  /** ADR-010: düello oturumu (değerlendirme arayüzüyle, `challenge` sunucu moduyla çalışır). */
  serverChallengeId: string | null;
}

export const initialTelemetry: Telemetry = {
  visits: {},
  order: [],
  headChanges: 0,
  headUse: { bell: 0, diaphragm: 0 },
  replayCount: 0,
};

export const initialState: AppState = {
  screen: "start",
  currentCaseId: "",
  bodySex: "erkek",
  mode: "practice",
  caseIndex: 0,
  step: 0,
  answers: {},
  revealed: {},
  hintsUsed: 0,
  attempts: 0,
  caseResults: [],
  telemetry: initialTelemetry,
  view: "front",
  head: "diaphragm",
  volume: 0.85,
  showPoints: true,
  showLabels: true,
  tutorialDone: false,
  tutorialSeen: false,
  tutorialStep: 0,
  assessmentTimer: 0,
  lastFeedback: null,
  dragStarted: false,
  session: { practiceIds: [], assessmentIds: [], seed: 0 },
  pendingSummary: null,
  learnFocusKey: null,
  bestScore: { practice: 0, assessment: 0 },
  server: null,
  serverFocus: null,
  serverChallengeId: null,
};

/* ---------------- en iyi puan deposu (K-P3 açık) ---------------- */
/** Cihaz-yerel anahtar/değer deposu (tarayıcıda `localStorage`, testte bellek). */
export interface StoragePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const BEST_SCORE_KEY = "ausculta.bestScore";

/** A4: kalıcı en iyi puanları oku (bozuk kayıt/erişim engelinde sıfırlara düş). */
export function loadBestScore(storage: StoragePort): { practice: number; assessment: number } {
  try {
    const raw = storage.get(BEST_SCORE_KEY);
    if (!raw) return { practice: 0, assessment: 0 };
    const parsed = JSON.parse(raw) as { practice?: number; assessment?: number };
    return { practice: Number(parsed.practice) || 0, assessment: Number(parsed.assessment) || 0 };
  } catch {
    return { practice: 0, assessment: 0 };
  }
}

/** A4: en iyi puanı kalıcı yaz (erişim engelinde sessizce yut — kaynak davranışı). */
export function saveBestScore(storage: StoragePort, bestScore: { practice: number; assessment: number }): void {
  try {
    storage.set(BEST_SCORE_KEY, JSON.stringify(bestScore));
  } catch {
    /* yut */
  }
}

export type Action =
  | { type: "goto"; screen: Screen }
  | { type: "startMode"; mode: Mode; focusFinding?: string; challengeId?: string }
  | { type: "caseMount"; caseDef: CaseDef }
  | { type: "setBodySex"; sex: BodySex }
  | { type: "startSession"; practiceIds: string[]; assessmentIds: string[]; seed: number }
  | { type: "setView"; view: PatientView }
  | { type: "setHead"; head: StethHead }
  | { type: "setVolume"; volume: number }
  | { type: "togglePoints"; show?: boolean }
  | { type: "toggleLabels"; show?: boolean }
  | { type: "visit"; pointId: string }
  | { type: "listen"; pointId: string; listenMs: number }
  | { type: "dwell"; pointId: string; dwellMs: number }
  | { type: "replay" }
  | { type: "answer"; qid: string; values: string[] }
  | { type: "submitAnswer"; qid: string; correct: boolean }
  | { type: "useHint" }
  | { type: "timer"; deltaMs: number }
  | { type: "advance" }
  | { type: "finishCase" }
  | { type: "nextCase" }
  | { type: "tutorialDone"; done: boolean }
  | { type: "tutorialSeen" }
  | { type: "tutorialStep"; step: number }
  | { type: "restore"; payload: SuspendPayload }
  | { type: "startDrag" }
  | { type: "resetCase" }
  | { type: "setResults"; results: CaseResult[] }
  | { type: "setLearnFocus"; key: string | null }
  | { type: "serverStarted"; sessionId: string; mode: "practice" | "assessment" | "challenge"; caseCount: number }
  | { type: "serverCaseLoaded"; index: number; clientCase: ServerClientCase }
  | { type: "serverChecked"; qid: string; feedback: ServerQuestionFeedback }
  | { type: "serverHint"; qid: string; hint: string }
  | { type: "serverSubmitting" }
  | { type: "serverSnapshot"; caseId: string; snapshot: ServerCaseSnapshot }
  | { type: "serverCaseResult"; result: CaseResult; meta: ServerCaseMeta | null }
  | { type: "serverFinished"; results: CaseResult[]; metas: Record<string, ServerCaseMeta> }
  | { type: "serverError"; message: string };

/** Reducer'ın dış dünya sınırı: olay yayını. Verilmezse olaylar yutulur (saf hesap kullanımı). */
export interface ReducerSeam {
  emit: (event: SimEventDraft) => void;
}

const noopSeam: ReducerSeam = { emit: () => undefined };

function bodySexFor(def: CaseDef): BodySex {
  const pop = (def as CaseDef & { population?: string }).population;
  if (pop === "pediatrik") return "pediatrik";
  return def.patient.sex === "kadın" ? "kadin" : "erkek";
}

/** Etkin vaka: yalnız sunucu oturumunda yüklü vaka (T196; istemcide yerel havuz yok). */
function findCase(s: AppState, id: string): CaseDef | undefined {
  return s.server?.currentCase?.id === id ? s.server.currentCase : undefined;
}

export function reducer(s: AppState, a: Action, seam: ReducerSeam = noopSeam): AppState {
  switch (a.type) {
    case "goto":
      return { ...s, screen: a.screen };
    case "caseMount": {
      const def = a.caseDef;
      // T233: vaka izinli görünümlerle gelir (`views`); açılış görünümü izinli ilk görünüm.
      const views = def.views.length > 0 ? def.views : (["front", "back"] as PatientView[]);
      const view = views[0] ?? s.view;
      if (def.id === s.currentCaseId && view === s.view) return s;
      return { ...s, currentCaseId: def.id, bodySex: bodySexFor(def), view };
    }
    case "startMode":
      // K4: yeni oturum eski sonuçları taşımaz — vaka sonuçları ve zamanlayıcı sıfırlanır.
      return {
        ...s,
        mode: a.mode,
        screen: "simulation",
        caseIndex: 0,
        step: 0,
        answers: {},
        revealed: {},
        hintsUsed: 0,
        telemetry: { ...initialTelemetry },
        lastFeedback: null,
        pendingSummary: null,
        caseResults: [],
        assessmentTimer: 0,
        attempts: s.attempts + 1,
        // A1.4: yeni mod yeni sunucu oturumu ister (sürücü başlatır).
        server: null,
        serverFocus: a.mode === "practice" ? (a.focusFinding ?? null) : null,
        serverChallengeId: a.mode === "assessment" ? (a.challengeId ?? null) : null,
      };
    case "setView":
      return { ...s, view: a.view };
    case "setBodySex":
      return { ...s, bodySex: a.sex };
    case "startSession":
      return { ...s, session: { practiceIds: a.practiceIds, assessmentIds: a.assessmentIds, seed: a.seed } };
    case "setHead":
      if (s.head === a.head) return s;
      seam.emit({ type: "filter_changed", head: a.head });
      return {
        ...s,
        head: a.head,
        telemetry: {
          ...s.telemetry,
          headChanges: s.telemetry.headChanges + 1,
          headUse: { ...s.telemetry.headUse, [a.head]: s.telemetry.headUse[a.head] + 1 },
        },
      };
    case "setVolume":
      return { ...s, volume: a.volume };
    case "togglePoints":
      return { ...s, showPoints: a.show ?? !s.showPoints };
    case "toggleLabels":
      return { ...s, showLabels: a.show ?? !s.showLabels };
    case "visit": {
      const visits = { ...s.telemetry.visits };
      const prev = visits[a.pointId];
      visits[a.pointId] = {
        dwellMs: prev?.dwellMs ?? 0,
        listenMs: prev?.listenMs ?? 0,
        visits: (prev?.visits ?? 0) + 1,
        firstOrder: prev ? prev.firstOrder : s.telemetry.order.length,
      };
      const order = prev ? s.telemetry.order : [...s.telemetry.order, a.pointId];
      seam.emit({ type: "point_visited", pointId: a.pointId, dwellMs: prev?.dwellMs ?? 0 });
      return { ...s, telemetry: { ...s.telemetry, visits, order } };
    }
    case "dwell": {
      const visits = { ...s.telemetry.visits };
      const prev = visits[a.pointId] ?? { dwellMs: 0, listenMs: 0, visits: 1, firstOrder: s.telemetry.order.length };
      visits[a.pointId] = { ...prev, dwellMs: prev.dwellMs + a.dwellMs };
      return { ...s, telemetry: { ...s.telemetry, visits } };
    }
    case "listen": {
      const visits = { ...s.telemetry.visits };
      const prev = visits[a.pointId] ?? { dwellMs: 0, listenMs: 0, visits: 1, firstOrder: s.telemetry.order.length };
      visits[a.pointId] = { ...prev, listenMs: prev.listenMs + a.listenMs };
      seam.emit({ type: "auscultation_stopped", pointId: a.pointId, listenMs: a.listenMs });
      return { ...s, telemetry: { ...s.telemetry, visits } };
    }
    case "replay":
      return { ...s, telemetry: { ...s.telemetry, replayCount: s.telemetry.replayCount + 1 } };
    case "answer":
      seam.emit({ type: "answer_selected", qid: a.qid });
      return { ...s, answers: { ...s.answers, [a.qid]: a.values } };
    case "submitAnswer":
      {
        const question = findCase(s, s.currentCaseId)?.questions.find((item) => item.id === a.qid);
        seam.emit({ type: "answer_submitted", qid: a.qid, correct: a.correct });
        if (a.correct && question?.domain === "diagnosis") seam.emit({ type: "correct_diagnosis", caseId: s.currentCaseId, qid: a.qid });
      }
      return { ...s, revealed: { ...s.revealed, [a.qid]: true }, lastFeedback: { correct: a.correct, qid: a.qid } };
    case "useHint":
      seam.emit({ type: "hint_used", caseId: s.currentCaseId });
      return { ...s, hintsUsed: s.hintsUsed + 1 };
    case "timer":
      return { ...s, assessmentTimer: s.assessmentTimer + a.deltaMs };
    case "advance": {
      const def = findCase(s, s.currentCaseId);
      if (!def) return s;
      if (def.questions[s.step + 1] == null) return s;
      return { ...s, step: s.step + 1, lastFeedback: null };
    }
    case "finishCase": {
      const def = findCase(s, s.currentCaseId);
      if (!def) return s;
      let result = scoreCase(def, s.answers, s.telemetry, s.hintsUsed);
      if (s.mode === "practice" && s.hintsUsed > 0) {
        const adjustedTotal = practiceAdjusted(result.total, s.hintsUsed);
        const threshold = def.masteryThreshold ?? MASTERY_THRESHOLD;
        result = { ...result, total: adjustedTotal, mastery: adjustedTotal >= threshold };
      }
      const domainPercents: Partial<Record<string, number>> = {};
      for (const [key, value] of Object.entries(result.domains)) {
        if (value.max > 0) domainPercents[key] = Math.round((value.earned / value.max) * 100);
      }
      if (s.mode !== "learn") seam.emit({ type: "case_completed", caseId: def.id, mode: s.mode, score: result.total, mastery: result.mastery, hintsUsed: result.hintsUsed, domains: domainPercents });
      return {
        ...s,
        caseResults: [...s.caseResults, result],
        pendingSummary: result,
        lastFeedback: null,
      };
    }
    case "nextCase":
      return {
        ...s,
        pendingSummary: null,
        step: 0,
        answers: {},
        revealed: {},
        hintsUsed: 0,
        telemetry: { ...initialTelemetry },
        caseIndex: s.caseIndex + 1,
        lastFeedback: null,
      };
    case "tutorialDone":
      return { ...s, tutorialDone: a.done };
    case "tutorialSeen":
      return { ...s, tutorialSeen: true };
    case "tutorialStep":
      return { ...s, tutorialStep: a.step };
    case "restore": {
      const p = a.payload;
      const session =
        p.mode === "assessment"
          ? { ...s.session, assessmentIds: p.sessionIds, seed: p.sessionSeed }
          : p.mode === "practice"
            ? { ...s.session, practiceIds: p.sessionIds, seed: p.sessionSeed }
            : s.session;
      return {
        ...s,
        mode: p.mode,
        caseIndex: p.caseIndex,
        step: p.step,
        answers: p.answers,
        hintsUsed: p.hintsUsed,
        tutorialDone: p.tutorialDone,
        telemetry: { ...initialTelemetry, visits: p.visits, order: p.order },
        caseResults: p.caseResults,
        attempts: p.attempts,
        session,
        screen: p.mode === "learn" ? "learn" : "simulation",
      };
    }
    case "startDrag":
      return { ...s, dragStarted: true };
    case "resetCase":
      return {
        ...s,
        step: 0,
        answers: {},
        revealed: {},
        hintsUsed: 0,
        telemetry: { ...initialTelemetry },
        lastFeedback: null,
        pendingSummary: null,
      };
    case "setResults": {
      const modeKey: "practice" | "assessment" = s.mode === "assessment" ? "assessment" : "practice";
      const agg = aggregateResults(a.results);
      const prevBest = s.bestScore[modeKey] ?? 0;
      const bestScore = agg.total > prevBest ? { ...s.bestScore, [modeKey]: agg.total } : s.bestScore;
      return { ...s, caseResults: a.results, screen: "results", bestScore };
    }
    case "setLearnFocus":
      return { ...s, learnFocusKey: a.key };
    case "serverStarted":
      return {
        ...s,
        server: {
          sessionId: a.sessionId,
          mode: a.mode,
          caseCount: a.caseCount,
          loadedIndex: 0,
          currentCase: null,
          feedback: {},
          hints: {},
          metas: {},
          snapshots: {},
          status: "loading",
          error: null,
        },
      };
    case "serverCaseLoaded":
      if (!s.server) return s;
      return {
        ...s,
        currentCaseId: a.clientCase.id,
        server: { ...s.server, loadedIndex: a.index, currentCase: a.clientCase, feedback: {}, hints: {}, status: "ready", error: null },
      };
    case "serverChecked":
      if (!s.server) return s;
      return { ...s, server: { ...s.server, feedback: { ...s.server.feedback, [a.qid]: a.feedback } } };
    case "serverHint":
      if (!s.server) return s;
      return { ...s, server: { ...s.server, hints: { ...s.server.hints, [a.qid]: a.hint } } };
    case "serverSnapshot":
      if (!s.server) return s;
      return { ...s, server: { ...s.server, snapshots: { ...s.server.snapshots, [a.caseId]: a.snapshot } } };
    case "serverSubmitting":
      if (!s.server) return s;
      return { ...s, server: { ...s.server, status: "submitting" } };
    case "serverCaseResult": {
      // Yerel `finishCase` karşılığı; `case_completed` YAYINLANMAZ (denemeyi sunucu yazar).
      if (!s.server) return s;
      const metas = a.meta === null ? s.server.metas : { ...s.server.metas, [a.result.caseId]: a.meta };
      const given = s.server.snapshots[a.result.caseId]?.given ?? {};
      const result = { ...a.result, answers: a.result.answers.map((answer) => ({ ...answer, given: [...(given[answer.qid] ?? [])] })) };
      return {
        ...s,
        caseResults: [...s.caseResults, result],
        pendingSummary: result,
        lastFeedback: null,
        server: { ...s.server, metas, status: "ready" },
      };
    }
    case "serverFinished": {
      if (!s.server) return s;
      const modeKey: "practice" | "assessment" = s.mode === "assessment" ? "assessment" : "practice";
      const snapshots = s.server.snapshots;
      const results = a.results.map((item) => ({
        ...item,
        answers: item.answers.map((answer) => ({ ...answer, given: [...(snapshots[item.caseId]?.given[answer.qid] ?? [])] })),
      }));
      const agg = aggregateResults(results);
      const prevBest = s.bestScore[modeKey] ?? 0;
      const bestScore = agg.total > prevBest ? { ...s.bestScore, [modeKey]: agg.total } : s.bestScore;
      return {
        ...s,
        caseResults: results,
        screen: "results",
        bestScore,
        server: { ...s.server, metas: { ...s.server.metas, ...a.metas }, status: "finished" },
      };
    }
    case "serverError":
      if (!s.server) return { ...s, server: null };
      return { ...s, server: { ...s.server, status: "error", error: a.message } };
    default:
      return s;
  }
}

/** Suspend yükü — yalnız AKTİF modun oturum listesi yazılır (K3). Kaynak: `buildSuspend`. */
export function buildSuspend(state: AppState): SuspendPayload {
  const activeIds = state.mode === "assessment" ? state.session.assessmentIds : state.session.practiceIds;
  return {
    v: 1,
    mode: state.mode,
    caseIndex: state.caseIndex,
    step: state.step,
    answers: state.answers,
    hintsUsed: state.hintsUsed,
    caseResults: state.caseResults,
    tutorialDone: state.tutorialDone,
    visits: state.telemetry.visits,
    order: state.telemetry.order,
    attempts: state.attempts,
    sessionIds: activeIds,
    sessionSeed: state.session.seed,
  };
}
