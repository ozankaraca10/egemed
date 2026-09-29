import type { CaseDef, CaseResult, Mode, Screen, SuspendPayload, Telemetry, ViewerTool } from "./types";
import type { SimEventDraft } from "./events";
import { aggregateResults, practiceAdjusted, scoreCase, MASTERY_THRESHOLD } from "./scoring";
import { getImage } from "./images";
import { zonesForImage } from "../data/zones";
import type { ServerCaseMeta, ServerCaseSnapshot, ServerClientCase, ServerQuestionFeedback, ServerSessionState } from "./serverSession";

/** Opaca durum iskeleti ve saf reducer (kaynak: `core/store.tsx:1-255`).
 *  React/DOM importu yoktur; `Date.now()` kullanılmaz. Yamalar şu iki sınırla dışarı açılır:
 *  - olay yayını `ReducerSeam.emit` ile gelir; zaman damgasını `createBus(now)` vurur (§7.4);
 *  - cihaz-yerel en iyi puan `StoragePort` arkasındadır (§7.2, K-P3 kararı açık).
 *  Sağlanmayan sınır no-op'a düşer, böylece reducer saf kalır: aynı girdi → aynı çıktı. */

/* ---------------- state ---------------- */
export interface AppState {
  screen: Screen;
  currentCaseId: string;
  mode: Mode;
  caseIndex: number;
  step: number;
  answers: Record<string, string[]>;
  revealed: Record<string, boolean>;
  hintsUsed: number;
  attempts: number;
  caseResults: CaseResult[];
  telemetry: Telemetry;
  /** Öğrenme/Uygulamada okuma bölgesi katmanı */
  showZones: boolean;
  tutorialDone: boolean;
  tutorialSeen: boolean;
  /** değerlendirme oturumunun toplam süresi */
  assessmentTimer: number;
  /** aktif vakanın süresi (vaka süre sınırı için) */
  caseElapsed: number;
  lastFeedback: { correct: boolean; qid: string } | null;
  session: { practiceIds: string[]; assessmentIds: string[]; seed: number };
  pendingSummary: CaseResult | null;
  learnFocusKey: string | null;
  /** Öğrenmeye odaklı dönüşte açılacak örnek film sırası (tek seferlik; learnFocusKey ile birlikte). */
  learnFocusIdx: number | null;
  /** "Bu konuda uygulama yap" ile açılan uygulama oturumu: dönülecek konu/örnek. Yeni örneklem, mod
   *  seçimine dönüş ya da başka moda geçiş bu bağlantıyı kaldırır. SCORM suspend şemasına dahil değildir. */
  topicReturn: { key: string; exampleIdx: number; title: string } | null;
  /** A4: mod başına kalıcı en iyi toplam puan — "Yeni örneklem" onayında "en iyi puan
   *  korunur" ifadesinin karşılığı; `StoragePort` ile okunur/yazılır, oturum/örneklem sıfırlansa
   *  da silinmez. SCORM suspend şemasına dahil değildir. */
  bestScore: { practice: number; assessment: number };
  /** A2.3 (ADR-009): sunucu vaka oturumu; null ise oturum yok (öğrenme ya da henüz başlamadı). */
  server: ServerSessionState | null;
  /** Öğrenme ekranından "bu konuda uygulama yap": sonraki uygulama oturumunun odak bulgusu. */
  serverFocus: string | null;
  /** ADR-010: düello oturumu (değerlendirme arayüzüyle, `challenge` sunucu moduyla çalışır). */
  serverChallengeId: string | null;
}

const emptyToolUse = (): Record<ViewerTool, number> => ({ zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 });
export const initialTelemetry = (): Telemetry => ({ visits: {}, order: [], toolUse: emptyToolUse() });

export const initialState: AppState = {
  screen: "start",
  currentCaseId: "",
  mode: "practice",
  caseIndex: 0,
  step: 0,
  answers: {},
  revealed: {},
  hintsUsed: 0,
  attempts: 0,
  caseResults: [],
  telemetry: initialTelemetry(),
  showZones: true,
  tutorialDone: false,
  tutorialSeen: false,
  assessmentTimer: 0,
  caseElapsed: 0,
  lastFeedback: null,
  session: { practiceIds: [], assessmentIds: [], seed: 0 },
  pendingSummary: null,
  learnFocusKey: null,
  learnFocusIdx: null,
  topicReturn: null,
  bestScore: { practice: 0, assessment: 0 },
  server: null,
  serverFocus: null,
  serverChallengeId: null,
};

/* ---------------- en iyi puan deposu (E2 §7.2) ---------------- */
/** Cihaz-yerel anahtar/değer deposu (tarayıcıda `localStorage`, testte bellek). */
export interface StoragePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const BEST_SCORE_KEY = "opaca.bestScore";
/** Tam ekran istemi "Tekrar sorma" onayı (kaynak: `StartScreen.tsx`, E2 §7.2). */
export const FS_PROMPT_KEY = "opaca.fsPromptDone";

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

/** Tam ekran istemi tamamlandı mı (bozuk kayıt/erişim engelinde false). */
export function loadFsPromptDone(storage: StoragePort): boolean {
  try {
    return storage.get(FS_PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}

/** "Tekrar sorma" işaretliyse tam ekran istemini kalıcı yaz (erişim engelinde sessizce yut). */
export function saveFsPromptDone(storage: StoragePort): void {
  try {
    storage.set(FS_PROMPT_KEY, "1");
  } catch {
    /* yut */
  }
}

export type Action =
  | { type: "goto"; screen: Screen }
  | { type: "startMode"; mode: Mode; focusFinding?: string; challengeId?: string }
  | { type: "caseMount"; caseDef: CaseDef }
  | { type: "startSession"; practiceIds: string[]; assessmentIds: string[]; seed: number }
  | { type: "toggleZones"; show?: boolean }
  | { type: "zoneEnter"; zoneIds: string[] }
  | { type: "zoneDwell"; zoneIds: string[]; dwellMs: number }
  | { type: "toolUsed"; tool: ViewerTool }
  | { type: "answer"; qid: string; values: string[] }
  | { type: "submitAnswer"; qid: string; correct: boolean }
  | { type: "useHint" }
  | { type: "timer"; deltaMs: number }
  | { type: "advance" }
  | { type: "finishCase" }
  | { type: "nextCase" }
  | { type: "tutorialDone"; done: boolean }
  | { type: "tutorialSeen" }
  | { type: "restore"; payload: SuspendPayload }
  | { type: "resetCase" }
  | { type: "setResults"; results: CaseResult[] }
  | { type: "setLearnFocus"; key: string | null; idx?: number | null }
  | { type: "startTopicPractice"; key: string; exampleIdx: number; title: string; focusFinding: string | null }
  | { type: "returnToTopic" }
  | { type: "serverStarted"; sessionId: string; mode: "practice" | "assessment" | "challenge"; caseCount: number; perCaseLimitMs: number | null }
  | { type: "serverCaseLoaded"; index: number; clientCase: ServerClientCase }
  | { type: "serverChecked"; qid: string; feedback: ServerQuestionFeedback }
  | { type: "serverHint"; qid: string; hint: string }
  | { type: "serverSubmitting" }
  | { type: "serverSnapshot"; caseId: string; snapshot: ServerCaseSnapshot }
  | { type: "serverCaseResult"; result: CaseResult; meta: ServerCaseMeta | null }
  | { type: "serverFinished"; results: CaseResult[]; metas: Record<string, ServerCaseMeta> }
  | { type: "serverError"; message: string };

/** Reducer'ın dış dünya sınırı: olay yayını. Verilmezse olaylar yutulur (saf hesap kullanımı);
 *  `StoreProvider` (S7) mount başına veri yolunu bağlar. */
export interface ReducerSeam {
  emit: (event: SimEventDraft) => void;
}

const noopSeam: ReducerSeam = { emit: () => undefined };

/** Etkin vaka: yalnız sunucu oturumunda yüklü vaka (A2.3; istemcide yerel havuz yok). */
function findCase(s: AppState, id: string): CaseDef | undefined {
  return s.server?.currentCase?.id === id ? s.server.currentCase : undefined;
}

/** Vaka puanı (store dışı da kullanılır: testler, sonuç ekranı). */
export function computeCaseResult(def: CaseDef, s: Pick<AppState, "answers" | "telemetry" | "hintsUsed" | "mode">): CaseResult {
  let result = scoreCase(def, s.answers, s.telemetry, s.hintsUsed, getImage(def.imageId), zonesForImage(def.imageId) ?? []);
  if (s.mode === "practice" && s.hintsUsed > 0) {
    const adjusted = practiceAdjusted(result.total, s.hintsUsed);
    result = { ...result, total: adjusted, mastery: adjusted >= (def.masteryThreshold ?? MASTERY_THRESHOLD) };
  }
  return result;
}

export function reducer(s: AppState, a: Action, seam: ReducerSeam = noopSeam): AppState {
  switch (a.type) {
    case "goto":
      return { ...s, screen: a.screen, topicReturn: a.screen === "modes" ? null : s.topicReturn };
    case "caseMount":
      if (a.caseDef.id === s.currentCaseId) return s;
      return { ...s, currentCaseId: a.caseDef.id };
    case "startMode":
      // K4: yeni oturum eski sonuçları taşımaz
      return {
        ...s, mode: a.mode, screen: "simulation", caseIndex: 0, step: 0, answers: {}, revealed: {}, hintsUsed: 0,
        telemetry: initialTelemetry(), lastFeedback: null, pendingSummary: null,
        caseResults: [], assessmentTimer: 0, caseElapsed: 0, attempts: s.attempts + 1, currentCaseId: "",
        topicReturn: a.mode === "practice" ? s.topicReturn : null,
        // A2.3: yeni mod yeni sunucu oturumu ister (sürücü başlatır).
        server: null,
        serverFocus: a.mode === "practice" ? (a.focusFinding ?? null) : null,
        serverChallengeId: a.mode === "assessment" ? (a.challengeId ?? null) : null,
      };
    case "startSession":
      return { ...s, session: { practiceIds: a.practiceIds, assessmentIds: a.assessmentIds, seed: a.seed }, topicReturn: null };
    case "startTopicPractice": {
      // A2.3: konu uygulaması da sunucudan açılır; odak bulgusu oturum isteğine girer.
      const started = reducer(s, { type: "startMode", mode: "practice", ...(a.focusFinding === null ? {} : { focusFinding: a.focusFinding }) }, seam);
      return { ...started, topicReturn: { key: a.key, exampleIdx: a.exampleIdx, title: a.title } };
    }
    case "returnToTopic": {
      if (!s.topicReturn) return s;
      const learn = reducer(s, { type: "startMode", mode: "learn" }, seam);
      return { ...learn, screen: "learn", learnFocusKey: s.topicReturn.key, learnFocusIdx: s.topicReturn.exampleIdx, topicReturn: null };
    }
    case "toggleZones":
      return { ...s, showZones: a.show ?? !s.showZones };
    case "zoneEnter": {
      if (!a.zoneIds.length) return s;
      const visits = { ...s.telemetry.visits };
      let order = s.telemetry.order;
      for (const id of a.zoneIds) {
        const prev = visits[id];
        visits[id] = { dwellMs: prev?.dwellMs ?? 0, visits: (prev?.visits ?? 0) + 1, firstOrder: prev ? prev.firstOrder : order.length };
        if (!prev) {
          order = [...order, id];
          seam.emit({ type: "zone_visited", zoneId: id });
        }
      }
      return { ...s, telemetry: { ...s.telemetry, visits, order } };
    }
    case "zoneDwell": {
      if (!a.zoneIds.length || a.dwellMs <= 0) return s;
      const visits = { ...s.telemetry.visits };
      let order = s.telemetry.order;
      for (const id of a.zoneIds) {
        const prev = visits[id];
        if (!prev) order = [...order, id];
        visits[id] = prev
          ? { ...prev, dwellMs: prev.dwellMs + a.dwellMs }
          : { dwellMs: a.dwellMs, visits: 1, firstOrder: order.length - 1 };
      }
      return { ...s, telemetry: { ...s.telemetry, visits, order } };
    }
    case "toolUsed":
      seam.emit({ type: "tool_used", tool: a.tool });
      return { ...s, telemetry: { ...s.telemetry, toolUse: { ...s.telemetry.toolUse, [a.tool]: s.telemetry.toolUse[a.tool] + 1 } } };
    case "answer":
      seam.emit({ type: "answer_selected", qid: a.qid });
      return { ...s, answers: { ...s.answers, [a.qid]: a.values } };
    case "submitAnswer":
      seam.emit({ type: "answer_submitted", qid: a.qid, correct: a.correct });
      return { ...s, revealed: { ...s.revealed, [a.qid]: true }, lastFeedback: { correct: a.correct, qid: a.qid } };
    case "useHint":
      seam.emit({ type: "hint_used", caseId: s.currentCaseId });
      return { ...s, hintsUsed: s.hintsUsed + 1 };
    case "timer":
      return { ...s, assessmentTimer: s.assessmentTimer + a.deltaMs, caseElapsed: s.caseElapsed + a.deltaMs };
    case "advance": {
      const def = findCase(s, s.currentCaseId);
      if (!def || def.questions[s.step + 1] == null) return s;
      return { ...s, step: s.step + 1, lastFeedback: null };
    }
    case "finishCase": {
      const def = findCase(s, s.currentCaseId);
      if (!def || s.pendingSummary) return s;
      const result = computeCaseResult(def, s);
      seam.emit({ type: "case_completed", caseId: def.id, mode: s.mode });
      return { ...s, caseResults: [...s.caseResults, result], pendingSummary: result, lastFeedback: null };
    }
    case "nextCase":
      return {
        ...s, pendingSummary: null, step: 0, answers: {}, revealed: {}, hintsUsed: 0,
        telemetry: initialTelemetry(), caseIndex: s.caseIndex + 1, lastFeedback: null, caseElapsed: 0,
      };
    case "tutorialDone":
      return { ...s, tutorialDone: a.done };
    case "tutorialSeen":
      return { ...s, tutorialSeen: true };
    case "restore": {
      const p = a.payload;
      // K3: oturum örneklemi yalnız AKTİF modun listesine yüklenir
      const session =
        p.mode === "assessment"
          ? { ...s.session, assessmentIds: p.sessionIds, seed: p.sessionSeed }
          : p.mode === "practice"
            ? { ...s.session, practiceIds: p.sessionIds, seed: p.sessionSeed }
            : s.session;
      return {
        ...s, mode: p.mode, caseIndex: p.caseIndex, step: p.step, answers: p.answers, hintsUsed: p.hintsUsed,
        tutorialDone: p.tutorialDone, tutorialSeen: true,
        telemetry: { ...initialTelemetry(), visits: p.visits, order: p.order },
        caseResults: p.caseResults, attempts: p.attempts, session,
        screen: p.mode === "learn" ? "learn" : "simulation",
      };
    }
    case "resetCase":
      return { ...s, step: 0, answers: {}, revealed: {}, hintsUsed: 0, telemetry: initialTelemetry(), lastFeedback: null, pendingSummary: null };
    case "setResults": {
      // A4: oturum bitince mod başına en iyi toplam puanı güncelle (yalnız practice/assessment;
      // learn modu setResults dispatch etmez). Yeni örneklem/oturum sıfırlansa da korunur.
      const modeKey: "practice" | "assessment" = s.mode === "assessment" ? "assessment" : "practice";
      const agg = aggregateResults(a.results);
      const prevBest = s.bestScore[modeKey] ?? 0;
      const bestScore = agg.total > prevBest ? { ...s.bestScore, [modeKey]: agg.total } : s.bestScore;
      return { ...s, caseResults: a.results, screen: "results", bestScore };
    }
    case "setLearnFocus":
      return { ...s, learnFocusKey: a.key, learnFocusIdx: a.idx ?? null };
    case "serverStarted":
      return {
        ...s,
        server: {
          sessionId: a.sessionId,
          mode: a.mode,
          caseCount: a.caseCount,
          perCaseLimitMs: a.perCaseLimitMs,
          loadedIndex: 0,
          currentCase: null,
          cases: {},
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
        server: {
          ...s.server,
          loadedIndex: a.index,
          currentCase: a.clientCase,
          cases: { ...s.server.cases, [a.clientCase.id]: a.clientCase },
          feedback: {},
          hints: {},
          status: "ready",
          error: null,
        },
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

/** Suspend yükü — yalnız AKTİF modun oturum listesi yazılır (K3). Kaynak: `buildSuspend`
 *  (`store.tsx`); çalışma zamanının `getSuspend` sınırı ve `saveProgress` girdisidir. */
export function buildSuspend(state: AppState): SuspendPayload {
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
    sessionIds: state.mode === "assessment" ? state.session.assessmentIds : state.session.practiceIds,
    sessionSeed: state.session.seed,
  };
}
