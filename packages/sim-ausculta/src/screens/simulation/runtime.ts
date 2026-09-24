/** Simülasyon raporu ve yaşam döngüsü (S15c). React/DOM yok.
 *  Puan ve etkileşimler S8 `SimRuntime` adaptörüne gider.
 *  Dinleyici ve zamanlayıcı dönen işlevle düşer. Oyunlaştırma yalnız bayrak açıkken çağrılır.
 *  Zaman çağıranın `now` değeridir; `Date.now()` kullanılmaz. */

import { resolveCaseSounds } from "../../core/resolver";
import type { SimRuntime } from "../../core/runtime";
import type { Question, SimEvent, SoundAssignment } from "../../core/types";
import type { PrimaryActionPlan, SessionCompletionPlan, SimulationDispatch } from "./derive";

export interface SimulationPointerEvent {
  readonly key?: string;
  readonly target: unknown;
}

/** Popover belge sınırı. Üretimde kabuk `document` vekilini enjekte eder. */
export interface SimulationListenerEnv {
  addEventListener(type: "mousedown" | "keydown", handler: (event: SimulationPointerEvent) => void): void;
  removeEventListener(type: "mousedown" | "keydown", handler: (event: SimulationPointerEvent) => void): void;
  containsNode(root: unknown, target: unknown): boolean;
}

/** Vaka vurgu ve geçiş zamanlayıcısı. */
export interface SimulationClock {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export interface SimulationScreenEnv extends SimulationClock, SimulationListenerEnv {}

export interface SimulationGamiPort {
  recordAssessmentComplete(payload: { total: number; passed: boolean }, at: number): void | Promise<void>;
}

export interface SimulationBus {
  emit(event: Omit<Extract<SimEvent, { type: "assessment_completed" }>, "at">): void;
}

export function createNoopSimulationScreenEnv(): SimulationScreenEnv {
  return {
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    containsNode: () => false,
  };
}

/** Tek atımlık zamanlayıcı. Dönen işlev süreyi keser; kesildikten sonra geri arama çalışmaz. */
export function armTimer(clock: SimulationClock, ms: number, onFire: () => void): () => void {
  let stopped = false;
  const handle = clock.setTimeout(() => {
    if (stopped) return;
    onFire();
  }, ms);
  return () => {
    if (stopped) return;
    stopped = true;
    clock.clearTimeout(handle);
  };
}

/** Dışarı tıklama ve Escape dinleyicisi. Dönen işlev her iki kaydı da kaldırır; ikinci çağrı etkisizdir. */
export function bindDismissListeners(
  env: SimulationListenerEnv,
  contains: (target: unknown) => boolean,
  onDismiss: () => void,
): () => void {
  const onPointer = (event: SimulationPointerEvent): void => {
    if (!contains(event.target)) onDismiss();
  };
  const onKey = (event: SimulationPointerEvent): void => {
    if (event.key === "Escape") onDismiss();
  };
  env.addEventListener("mousedown", onPointer);
  env.addEventListener("keydown", onKey);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    env.removeEventListener("mousedown", onPointer);
    env.removeEventListener("keydown", onKey);
  };
}

/** Soru ilk göründüğünde damgayı yazar; sonraki çağrılar aynı soruyu ezmez. */
export function rememberQuestionShown(
  shownAt: Readonly<Record<string, number>>,
  questionId: string,
  nowMs: number,
): Record<string, number> {
  if (shownAt[questionId]) return { ...shownAt };
  return { ...shownAt, [questionId]: nowMs };
}

/** Kaynak vaka açılışında ses haritasını ısıtır. Ağ çağrısı yoktur. */
export function warmCaseSounds(assignments: readonly SoundAssignment[]): void {
  resolveCaseSounds([...assignments]);
}

/** Değerlendirme oturumu bitince skoru adaptöre yazar. Bayrak kapalıyken oyunlaştırma çağrılmaz. */
export function reportSessionCompletion(params: {
  plan: SessionCompletionPlan;
  runtime: Pick<SimRuntime, "reportScore">;
  bus: SimulationBus;
  gamiEnabled: boolean;
  gami?: SimulationGamiPort | undefined;
}): void {
  if (!params.plan.reportScore || params.plan.completedAt == null) return;
  const { total, mastery } = params.plan.aggregate;
  params.runtime.reportScore(total, mastery, true);
  params.bus.emit({ type: "assessment_completed", total });
  if (params.gamiEnabled && params.gami) {
    void params.gami.recordAssessmentComplete({ total, passed: mastery }, params.plan.completedAt);
  }
}

/** Birincil eylem: reducer adımları, son soruda etkileşim kaydı. */
export function applyPrimaryAction(params: {
  plan: PrimaryActionPlan;
  dispatch: (action: SimulationDispatch) => void;
  runtime: Pick<SimRuntime, "saveInteractions">;
  caseId: string;
  questions: Question[];
  answers: Record<string, string[]>;
}): void {
  for (const action of params.plan.dispatches) params.dispatch(action);
  if (!params.plan.saveInteractions || !params.plan.latency) return;
  params.runtime.saveInteractions(params.caseId, params.questions, params.answers, params.plan.latency);
}
