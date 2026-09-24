import type { CaseDef, CaseResult, Mode, Screen, SuspendPayload, Telemetry, ViewerTool } from "./types";
import type { SimEventDraft } from "./events";
import { aggregateResults, practiceAdjusted, scoreCase, MASTERY_THRESHOLD } from "./scoring";
import { getImage } from "./images";
import { ALL_CASES } from "../data/pool";
import { ZONES } from "../data/zones";

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
};

/* ---------------- en iyi puan deposu (E2 §7.2) ---------------- */
/** Cihaz-yerel anahtar/değer deposu (tarayıcıda `localStorage`, testte bellek). */
export interface StoragePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const BEST_SCORE_KEY = "opaca.bestScore";

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
  | { type: "startMode"; mode: Mode }
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
  | { type: "startTopicPractice"; key: string; exampleIdx: number; title: string; practiceIds: string[]; seed: number }
  | { type: "returnToTopic" };

/** Reducer'ın dış dünya sınırı: olay yayını. Verilmezse olaylar yutulur (saf hesap kullanımı);
 *  `StoreProvider` (S7) mount başına veri yolunu bağlar. */
export interface ReducerSeam {
  emit: (event: SimEventDraft) => void;
}

const noopSeam: ReducerSeam = { emit: () => undefined };

const findCase = (id: string) => ALL_CASES.find((c) => c.id === id);

/** Vaka puanı (store dışı da kullanılır: testler, sonuç ekranı). */
export function computeCaseResult(def: CaseDef, s: Pick<AppState, "answers" | "telemetry" | "hintsUsed" | "mode">): CaseResult {
  let result = scoreCase(def, s.answers, s.telemetry, s.hintsUsed, getImage(def.imageId), ZONES);
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
      };
    case "startSession":
      return { ...s, session: { practiceIds: a.practiceIds, assessmentIds: a.assessmentIds, seed: a.seed }, topicReturn: null };
    case "startTopicPractice": {
      const withSession = reducer(s, { type: "startSession", practiceIds: a.practiceIds, assessmentIds: s.session.assessmentIds, seed: a.seed }, seam);
      const started = reducer(withSession, { type: "startMode", mode: "practice" }, seam);
      return { ...started, topicReturn: { key: a.key, exampleIdx: a.exampleIdx, title: a.title } };
    }
    case "returnToTopic": {
      if (!s.topicReturn) return s;
      // Konu uygulamasının 5 vakalık listesi normal uygulama örneklemi değildir; boşaltılır ki bir sonraki
      // uygulama girişi (SimulationScreen K3 etkisi) yeni ve tam bir örneklem çeksin.
      const learn = reducer({ ...s, session: { ...s.session, practiceIds: [] } }, { type: "startMode", mode: "learn" }, seam);
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
      const def = findCase(s.currentCaseId);
      if (!def || def.questions[s.step + 1] == null) return s;
      return { ...s, step: s.step + 1, lastFeedback: null };
    }
    case "finishCase": {
      const def = findCase(s.currentCaseId);
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
    default:
      return s;
  }
}
