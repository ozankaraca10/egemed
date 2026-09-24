import type { ImageRecord, Question, SuspendPayload } from "./types";
import { isAnswerCorrect } from "./answers";
import { markToScorm } from "./geometry";
import { SUSPEND_LIMIT_2004, deserializeSuspend, serializeSuspend } from "./suspend";

/** Çalışma zamanı adaptörü (E2 §7.1, §10/5): SCORM yerine platform seam'i.
 *  İlk portta bellek/no-op uygulamaları kullanılır; xAPI eşlemesi K2/K3 sonrası T22/T23'e bırakılır.
 *  SCORM'a özgü pencere (`parent`/`opener`) taraması, `cmi.*` alan adları ve öğrenci kimliği
 *  (`learner_name`) BİLİNÇLİ olarak taşınmaz (KVKK, ADR-005/007): kimlik kabuk/oturum katmanındadır.
 *  Zaman yalnız enjekte edilen `now` üzerinden okunur; `Date.now()` kullanılmaz (AGENTS.md). */

/** Tek soru yanıtının aktarım kaydı (kaynak: `cmi.interactions.N.*`). */
export interface InteractionRecord {
  /** `${caseId}.${questionId}` — kaynak: `interactions.N.id` */
  id: string;
  /** seçmeli → "choice"; lokalizasyon işareti → "fill-in" */
  type: "choice" | "fill-in";
  /** verilen yanıtlar; işaret `"x43y55"` biçiminde tek elemanlı dizidir */
  response: string[];
  correct: boolean;
  /** yanıt gecikmesi (sn, en yakına yuvarlanır) — kaynak: `interactions.N.latency` */
  latencySec?: number;
}

/** Puan/ilerleme raporu (kaynak: `cmi.score.*`, `success_status`, `completion_status`, `progress_measure`). */
export interface ScoreReport {
  /** 0–100 (kaynak: `cmi.score.raw`; ölçekli değer türetilir) */
  score: number;
  passed: boolean;
  finished: boolean;
  /** tamamlanan vaka oranı, üstten 1'e kırpılır (kaynak: `cmi.progress_measure`) */
  progress: number;
}

/** Oturum kapanış özeti (kaynak: `cmi.session_time`, `cmi.exit` ve terminate). */
export interface FinishReport {
  /** başlangıçtan bu yana geçen süre (sn) */
  elapsedSec: number;
  /** bitirildi mi; false ise oturum askıda kaldı (kaynak: `cmi.exit === 'suspend'`) */
  completed: boolean;
}

/** Suspend yazımı (kaynak: `cmi.suspend_data` + `cmi.location`). */
export interface SuspendWrite {
  /** serileştirilmiş yük; üst sınır aşılırsa kademeli küçültülür (suspend politikası aynı) */
  data: string;
  /** `case:<caseIndex>:step:<step>` */
  location: string;
}

/** Aktarım hedefi. Altı ilkel; öğrenci kimliği/pencere bilgisi taşımaz. */
export interface RuntimeAdapter {
  /** Oturumu başlatır ve kayıtlı suspend yükünü döndürür (yoksa null). */
  initialize(): SuspendPayload | null;
  setSuspend(write: SuspendWrite): void;
  recordInteraction(record: InteractionRecord): void;
  setScore(report: ScoreReport): void;
  /** Oturumu kapatır ve kapanış özetini yazar. */
  finish(report: FinishReport): void;
  /** Bekleyen yazımları hedefe uygular (kaynak: commit). */
  flush(): void;
}

export interface RuntimeOptions {
  adapter: RuntimeAdapter;
  /** Geçerli oturumun suspend anlık görüntüsü (S7/S19: `buildSuspend(state)`). */
  getSuspend: () => SuspendPayload;
  /** Değerlendirme havuzundaki vaka sayısı (ilerleme ölçüsü paydası). */
  totalCases: () => number;
  /** Zaman kaynağı (ms). */
  now: () => number;
  /** Suspend üst sınırı; varsayılan SUSPEND_LIMIT_2004 (kaynak: sürüme göre 4000/64000). */
  suspendLimit?: number;
}

/** Kaynak `ScormRuntime` API'sinin portu; çağrı adları kaynak çağrı yerleriyle aynıdır. */
export interface SimRuntime {
  readonly terminated: boolean;
  /** Kaynak: `init()` */
  init(): SuspendPayload | null;
  saveProgress(payload: SuspendPayload): void;
  saveInteractions(
    caseId: string,
    questions: Question[],
    answers: Record<string, string[]>,
    image: ImageRecord | undefined,
    latencyMs?: Record<string, number>
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
    saveInteractions(caseId, questions, answers, image, latencyMs): void {
      if (terminated) return;
      for (const q of questions) {
        const given = answers[q.id] ?? [];
        if (!given.length) continue;
        const isMark = q.type === "localization";
        const record: InteractionRecord = {
          id: `${caseId}.${q.id}`,
          type: isMark ? "fill-in" : "choice",
          response: isMark ? [markToScorm(given[0] ?? "")] : [...given],
          correct: isAnswerCorrect(q, given, image),
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

/** Bellek içi adaptör: çağrıları kronolojik kaydeder, son yazılanları tutar.
 *  Testler ve LMS'siz ilk port için (kaynak `MockAdapter` rolü). */
export interface MemoryRuntimeAdapter extends RuntimeAdapter {
  readonly calls: RuntimeCall[];
  readonly interactions: InteractionRecord[];
  /** Son yazılan serileştirilmiş suspend (kaynak: `cmi.suspend_data`). */
  suspendData: string | null;
  /** Son yazılan konum (kaynak: `cmi.location`). */
  location: string | null;
  score: ScoreReport | null;
  finished: FinishReport | null;
  flushCount: number;
}

export function createMemoryRuntimeAdapter(
  seed: { suspendData?: string | null; interactions?: InteractionRecord[] } = {}
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

/** Hiçbir şey tutmayan adaptör: çalışma zamanı yüzeyi açık ama kalıcılık istenmiyor. */
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
