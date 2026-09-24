import type { Question, SuspendPayload } from "./types";
import { SUSPEND_LIMIT_2004, deserializeSuspend, serializeSuspend } from "./suspend";

/** Çalışma zamanı adaptörü (E2 §5, S8b/S8d). SCORM/LMS yok (ADR-006).
 *  İlk portta bellek ve no-op kullanılır; xAPI eşlemesi sonraki dilime kalır.
 *  Pencere taraması (`parent`/`opener`, `API_1484_11`) ve öğrenci kimliği
 *  (`learner_name` / `learner_id`) taşınmaz (KVKK, ADR-005).
 *  Zaman yalnız enjekte edilen `now` üzerinden okunur; `Date.now()` kullanılmaz. */

/** Tek soru yanıtının aktarım kaydı (kaynak: `cmi.interactions.N.*`).
 *  CMI sonuç sözlüğü (`incorrect`/`wrong`), gecikme `PT#S` ve 1.2/2004 ayırıcıları taşınmaz. */
export interface InteractionRecord {
  /** `${caseId}.${questionId}` */
  id: string;
  /** Kaynak O2(a): sözlükte hep `choice`. */
  type: "choice";
  /** Verilen seçenek kimlikleri; CMI birleştirmesi yapılmaz. */
  response: string[];
  correct: boolean;
  /** Yanıt gecikmesi (sn, en yakına yuvarlanır). */
  latencySec?: number;
}

/** Puan/ilerleme raporu (kaynak: `cmi.score.*`, durum ve `progress_measure`). */
export interface ScoreReport {
  /** 0–100 */
  score: number;
  passed: boolean;
  finished: boolean;
  /** Tamamlanan vaka oranı, üstten 1'e kırpılır. */
  progress: number;
}

/** Oturum kapanış özeti (kaynak: `cmi.session_time`, `cmi.exit`). */
export interface FinishReport {
  /** Başlangıçtan bu yana geçen süre (sn). */
  elapsedSec: number;
  /** Bitirildi mi; false ise oturum askıda (kaynak: `cmi.exit === 'suspend'`). */
  completed: boolean;
}

/** Suspend yazımı (kaynak: `cmi.suspend_data` + konum). */
export interface SuspendWrite {
  data: string;
  /** `case:<caseIndex>:step:<step>` */
  location: string;
}

/** Aktarım hedefi. Altı ilkel; öğrenci kimliği ve pencere bilgisi taşımaz. */
export interface RuntimeAdapter {
  initialize(): SuspendPayload | null;
  setSuspend(write: SuspendWrite): void;
  recordInteraction(record: InteractionRecord): void;
  setScore(report: ScoreReport): void;
  finish(report: FinishReport): void;
  flush(): void;
}

export interface RuntimeOptions {
  adapter: RuntimeAdapter;
  getSuspend: () => SuspendPayload;
  /** Değerlendirme havuzundaki vaka sayısı (ilerleme paydası). */
  totalCases: () => number;
  now: () => number;
  /** Varsayılan SUSPEND_LIMIT_2004. Sürüme göre 1.2/2004 seçimi taşınmaz. */
  suspendLimit?: number;
}

/** Kaynak `ScormRuntime` yüzeyi; çağrı adları kaynakla aynıdır. */
export interface SimRuntime {
  readonly terminated: boolean;
  init(): SuspendPayload | null;
  saveProgress(payload: SuspendPayload): void;
  saveInteractions(
    caseId: string,
    questions: Question[],
    answers: Record<string, string[]>,
    latencyMs?: Record<string, number>,
  ): void;
  reportScore(score: number, passed: boolean, finished: boolean): void;
  flushNow(): void;
  terminate(): void;
}

export function createSimRuntime(options: RuntimeOptions): SimRuntime {
  const { adapter, getSuspend, totalCases, now } = options;
  const suspendLimit = options.suspendLimit ?? SUSPEND_LIMIT_2004;
  const startedAt = now();
  let terminated = false;
  let finished = false;

  function saveProgress(payload: SuspendPayload): void {
    if (terminated) return;
    adapter.setSuspend({
      data: serializeSuspend(payload, suspendLimit),
      location: `case:${payload.caseIndex}:step:${payload.step}`,
    });
    adapter.flush();
  }

  return {
    get terminated(): boolean {
      return terminated;
    },
    init(): SuspendPayload | null {
      return adapter.initialize();
    },
    saveProgress,
    saveInteractions(caseId, questions, answers, latencyMs): void {
      if (terminated) return;
      for (const q of questions) {
        const given = answers[q.id] ?? [];
        if (!given.length) continue;
        const correct =
          q.correct.length > 0 && q.correct.length === given.length && given.every((g) => q.correct.includes(g));
        const record: InteractionRecord = {
          id: `${caseId}.${q.id}`,
          type: "choice",
          response: [...given],
          correct,
        };
        const lat = latencyMs?.[q.id];
        if (lat != null) record.latencySec = Math.max(0, Math.round(lat / 1000));
        adapter.recordInteraction(record);
      }
    },
    reportScore(score, passed, finishedFlag): void {
      if (terminated) return;
      finished = finishedFlag;
      adapter.setScore({
        score,
        passed,
        finished: finishedFlag,
        progress: Math.min(1, getSuspend().caseResults.length / Math.max(1, totalCases())),
      });
      adapter.flush();
    },
    flushNow(): void {
      if (terminated) return;
      try {
        saveProgress(getSuspend());
      } catch {
        /* hedef erişilemezse sessizce yut (kaynak davranışı) */
      }
    },
    terminate(): void {
      if (terminated) return;
      adapter.finish({
        elapsedSec: Math.max(0, Math.round((now() - startedAt) / 1000)),
        completed: finished,
      });
      adapter.flush();
      terminated = true;
    },
  };
}

export type RuntimeCall =
  | { type: "initialize" }
  | { type: "setSuspend"; write: SuspendWrite }
  | { type: "recordInteraction"; record: InteractionRecord }
  | { type: "setScore"; report: ScoreReport }
  | { type: "finish"; report: FinishReport }
  | { type: "flush" };

/** Bellek içi adaptör (kaynak `MockAdapter` rolü). */
export interface MemoryRuntimeAdapter extends RuntimeAdapter {
  readonly calls: RuntimeCall[];
  readonly interactions: InteractionRecord[];
  suspendData: string | null;
  location: string | null;
  score: ScoreReport | null;
  finished: FinishReport | null;
  flushCount: number;
}

export function createMemoryRuntimeAdapter(
  seed: { suspendData?: string | null; interactions?: InteractionRecord[] } = {},
): MemoryRuntimeAdapter {
  const adapter: MemoryRuntimeAdapter = {
    calls: [],
    interactions: seed.interactions ? [...seed.interactions] : [],
    suspendData: seed.suspendData ?? null,
    location: null,
    score: null,
    finished: null,
    flushCount: 0,
    initialize(): SuspendPayload | null {
      adapter.calls.push({ type: "initialize" });
      return adapter.suspendData ? deserializeSuspend(adapter.suspendData) : null;
    },
    setSuspend(write): void {
      adapter.calls.push({ type: "setSuspend", write });
      adapter.suspendData = write.data;
      adapter.location = write.location;
    },
    recordInteraction(record): void {
      adapter.calls.push({ type: "recordInteraction", record });
      adapter.interactions.push(record);
    },
    setScore(report): void {
      adapter.calls.push({ type: "setScore", report });
      adapter.score = report;
    },
    finish(report): void {
      adapter.calls.push({ type: "finish", report });
      adapter.finished = report;
    },
    flush(): void {
      adapter.calls.push({ type: "flush" });
      adapter.flushCount += 1;
    },
  };
  return adapter;
}

/** Kalıcılık istenmediğinde boş adaptör. */
export function createNoopRuntimeAdapter(): RuntimeAdapter {
  return {
    initialize: () => null,
    setSuspend: () => undefined,
    recordInteraction: () => undefined,
    setScore: () => undefined,
    finish: () => undefined,
    flush: () => undefined,
  };
}
