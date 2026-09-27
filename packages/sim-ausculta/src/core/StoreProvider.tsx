import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type JSX, type ReactNode } from "react";
import type { EventBus } from "./events";
import { createBus } from "./events";
import { createFlushHandlers, createLifecycle, type Lifecycle, type WindowLike } from "./lifecycle";
import {
  buildSuspend,
  initialState,
  loadBestScore,
  reducer,
  saveBestScore,
  type Action,
  type AppState,
  type ReducerSeam,
  type StoragePort,
} from "./reducer";
import { createSimRuntime, type RuntimeAdapter, type SimRuntime } from "./runtime";
import { ASSESSMENT_CASE_COUNT } from "../data/inventory";

/** Ausculta store sağlayıcısı (kaynak `StoreProvider`, S8c/S8d).
 *  Mount başına tek veri yolu, tek çalışma zamanı ve tek yaşam döngüsü kurulur.
 *  `now`, `storage`, `runtime` ve `env` dışarıdan enjekte edilir.
 *  `window`/`document`/`localStorage` ve `Date.now()` kullanılmaz. */

const TIMER_INTERVAL_MS = 1000;


export interface StoreContextValue {
  readonly state: AppState;
  readonly dispatch: Dispatch<Action>;
  readonly bus: EventBus;
  readonly runtime: SimRuntime;
  readonly now: () => number;
  readonly storage: StoragePort;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (ctx === null) throw new Error("StoreProvider dışında kullanım");
  return ctx;
}

export interface StoreProviderProps {
  readonly children: ReactNode;
  readonly now: () => number;
  readonly storage: StoragePort;
  readonly runtime: RuntimeAdapter;
  readonly env: WindowLike;
  readonly initialState?: AppState;
}

function useMountRef<T>(factory: () => T): T {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = factory();
  return ref.current;
}

export function StoreProvider({
  children,
  now,
  storage,
  runtime: adapter,
  env,
  initialState: seedState,
}: StoreProviderProps): JSX.Element {
  const bus = useMountRef(() => createBus(now));
  const seam = useMountRef<ReducerSeam>(() => ({ emit: (event) => bus.emit(event) }));
  const [state, dispatch] = useReducer(
    (current: AppState, action: Action): AppState => reducer(current, action, seam),
    seedState ?? initialState,
    (init: AppState): AppState => ({ ...init, bestScore: loadBestScore(storage) }),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const simRuntime = useMountRef(() =>
    createSimRuntime({
      adapter,
      getSuspend: () => buildSuspend(stateRef.current),
      totalCases: () => ASSESSMENT_CASE_COUNT,
      now,
    }),
  );
  const lifecycle = useMountRef<Lifecycle>(() => createLifecycle(env));

  useEffect(() => {
    saveBestScore(storage, state.bestScore);
  }, [storage, state.bestScore]);

  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      const restored = simRuntime.init();
      if (restored !== null) dispatch({ type: "restore", payload: restored });
    }
    lifecycle.attach(createFlushHandlers(simRuntime));
    return () => lifecycle.detach();
  }, [dispatch, lifecycle, simRuntime]);

  useEffect(() => {
    if (state.screen === "start" || state.screen === "modes") return;
    simRuntime.saveProgress(buildSuspend(state));
  }, [state.mode, state.caseIndex, state.step, state.attempts, state.tutorialDone, simRuntime]);

  // Kaynak: sayaç yalnız değerlendirme simülasyonunda işler; unmount keser.
  useEffect(() => {
    if (state.mode !== "assessment" || state.screen !== "simulation") return;
    return lifecycle.startTicker(TIMER_INTERVAL_MS, () => dispatch({ type: "timer", deltaMs: TIMER_INTERVAL_MS }));
  }, [dispatch, lifecycle, state.mode, state.screen]);

  const value: StoreContextValue = { state, dispatch, bus, runtime: simRuntime, now, storage };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
