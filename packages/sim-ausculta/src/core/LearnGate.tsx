import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type JSX, type ReactNode } from "react";
import type { SimLearnPort } from "@egemed/sim-host";
import { useStore } from "./StoreProvider";
import { LOCKED_LEARN_SNAPSHOT, canStartMode, createLearnTracker, type LearnSnapshot, type LearnTracker } from "./learnLock";
import type { Mode } from "./types";

/** T209: öğrenme kilidinin React yüzeyi. Sağlayıcı yoksa güvenli varsayılan
 *  KİLİTLİdir (fail-safe): kilit yalnız gerçek ilerleme kanalıyla açılır. */

export interface LearnGateValue extends LearnSnapshot {
  /** Ses çalarken geçen süreyi konunun örneğine ekler (T308: her örnek 5 sn). */
  addListen(key: string, exampleIndex: number, ms: number): void;
}

const LearnGateContext = createContext<LearnGateValue>({
  ...LOCKED_LEARN_SNAPSHOT,
  addListen: () => undefined,
});

export function useLearnGate(): LearnGateValue {
  return useContext(LearnGateContext);
}

export interface LearnGateProviderProps {
  /** Kabuğun öğrenme tamamlama kanalı; ziyaretçide ve kanal yoksa verilmez. */
  readonly learn?: SimLearnPort;
  readonly children: ReactNode;
}

export function LearnGateProvider({ learn, children }: LearnGateProviderProps): JSX.Element {
  const { storage } = useStore();
  const trackerRef = useRef<LearnTracker | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = createLearnTracker(learn === undefined ? { storage } : { storage, learn });
  }
  const tracker = trackerRef.current;
  const snapshot = useSyncExternalStore(tracker.subscribe, tracker.snapshot, tracker.snapshot);
  const notified = useRef(false);
  useEffect(() => {
    if (notified.current) return;
    notified.current = true;
    tracker.notify();
  }, [tracker]);
  const value = useMemo<LearnGateValue>(
    () => ({ ...snapshot, addListen: (key: string, exampleIndex: number, ms: number) => tracker.addListen(key, exampleIndex, ms) }),
    [snapshot, tracker],
  );
  return <LearnGateContext.Provider value={value}>{children}</LearnGateContext.Provider>;
}

export interface StartModeOptions {
  readonly focusFinding?: string;
  readonly challengeId?: string;
}

/** Kilitliyken uygulama/değerlendirme başlatılamaz: tek koruma noktası.
 *  İstek öğrenme ekranına düşer; düello istisnası `App`'te ayrıca ele alınır. */
export function useStartMode(): (mode: Mode, options?: StartModeOptions) => boolean {
  const { dispatch } = useStore();
  const { complete } = useLearnGate();
  return useCallback(
    (mode: Mode, options?: StartModeOptions): boolean => {
      if (!canStartMode(mode, complete)) {
        dispatch({ type: "startMode", mode: "learn" });
        dispatch({ type: "goto", screen: "learn" });
        return false;
      }
      dispatch({ type: "startMode", mode, ...(options ?? {}) });
      return true;
    },
    [complete, dispatch],
  );
}
