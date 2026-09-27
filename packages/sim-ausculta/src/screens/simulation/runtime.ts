/** Simülasyon dinleyici ve zamanlayıcı yardımcıları (S15c). React/DOM yok.
 *  Dinleyici ve zamanlayıcı dönen işlevle düşer. */

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
