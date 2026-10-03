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
import { CASE_INVENTORY } from "../data/inventory";
import type { SimNavigation } from "@egemed/sim-host";

/** Opaca store sağlayıcısı (kaynak `core/store.tsx` portu, E2 §7.2/§7.4/§7.5).
 *  Mount başına tek olay veri yolu (`createBus(now)`), tek çalışma zamanı (`createSimRuntime`)
 *  ve tek yaşam döngüsü kaydı kurulur; `now`, `storage`, `runtime` (S5 adaptörü) ve `env`
 *  dışarıdan enjekte edilir. Paket içinde `window`/`document`/`localStorage` erişimi yoktur;
 *  `Date.now()` kullanılmaz — tüm zaman `now` üzerinden akar (AGENTS.md). */

/** Kaynak `window.setInterval(…, 1000)` süresi; portta yaşam döngüsü ticker'ı kurar. */
const TIMER_INTERVAL_MS = 1000;

/** Değerlendirme paydası (A2.3: istemci havuz taşımaz; sayı banka envanterinden gelir). */
const ASSESSMENT_CASE_COUNT = CASE_INVENTORY.assessmentPoolSize;

export interface StoreContextValue {
  readonly state: AppState;
  readonly dispatch: Dispatch<Action>;
  /** Mount'a bağlı veri yolu; ekranlar/DevPanel modül düzeyi tekil yerine bunu okur (§7.4). */
  readonly bus: EventBus;
  /** Mount'a bağlı çalışma zamanı (S5 adaptör seam'i). */
  readonly runtime: SimRuntime;
  /** Zaman kaynağı; seed/gecikme `Date.now()` yerine bunu kullanır. */
  readonly now: () => number;
  /** Cihaz-yerel anahtar deposu (K-P3 kararına kadar port arkasında, §7.2). */
  readonly storage: StoragePort;
  /** Pencere sınırı (zamanlayıcı, görünürlük); öğrenme inceleme süresi bununla sayılır (T320). */
  readonly env: WindowLike;
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
  /** S5 aktarım adaptörü; context'teki `runtime` bunun üzerine kurulu `SimRuntime`'dır. */
  readonly runtime: RuntimeAdapter;
  readonly env: WindowLike;
  /** Test/fixture: varsayılan `initialState` yerine verilen durumla başlar (bestScore yine storage'dan okunur). */
  readonly initialState?: AppState;
  readonly navigation?: SimNavigation;
}

/** Mount başına tek örnek: render sırasında tembel kurulur, ilk örnek korunur. Kurulan nesneler
 *  (veri yolu/çalışma zamanı/yaşam döngüsü) bağlanana dek yan etkisizdir; StrictMode'un atacağı
 *  ikinci render örneği bu yüzden zararsızdır. Prop'lar mount kapsamlıdır; sonradan değişmez. */
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
  navigation,
}: StoreProviderProps): JSX.Element {
  const bus = useMountRef(() => createBus(now));
  const seam = useMountRef<ReducerSeam>(() => ({ emit: (event) => bus.emit(event) }));
  const [state, dispatch] = useReducer(
    (current: AppState, action: Action): AppState => reducer(current, action, seam),
    seedState ?? initialState,
    (init: AppState): AppState => ({ ...init, bestScore: loadBestScore(storage) })
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const externalScreen = useRef<AppState["screen"] | null>(null);
  const firstNavigationRender = useRef(true);
  const simRuntime = useMountRef(() =>
    createSimRuntime({
      adapter,
      getSuspend: () => buildSuspend(stateRef.current),
      totalCases: () => ASSESSMENT_CASE_COUNT,
      now,
    })
  );
  const lifecycle = useMountRef<Lifecycle>(() => createLifecycle(env));

  useEffect(() => {
    if (navigation === undefined) return;
    return navigation.subscribe((key) => {
      const current = stateRef.current;
      if (key !== null && !["modlar", "ogrenme", "uygulama", "degerlendirme", "sonuc", "ilerlemem"].includes(key)) return;
      const screen = key === null || key === "modlar" ? "modes"
        : key === "ogrenme" ? "learn"
          : key === "uygulama" && current.mode !== "assessment" ? "simulation"
            : key === "degerlendirme" && current.mode === "assessment" && current.server !== null ? "simulation"
              : key === "sonuc" && current.caseResults.length > 0 ? "results"
                : key === "ilerlemem" ? "achievements" : null;
      if (screen === null) {
        navigation.report(current.screen === "learn" ? "ogrenme" : "modlar", { replace: true });
        return;
      }
      if (screen !== current.screen) {
        externalScreen.current = screen;
        dispatch({ type: "goto", screen });
      }
    });
  }, [dispatch, navigation]);

  useEffect(() => {
    if (navigation === undefined) return;
    const key = state.screen === "learn" ? "ogrenme"
      : state.screen === "simulation" ? (state.mode === "assessment" ? "degerlendirme" : "uygulama")
        : state.screen === "results" ? "sonuc"
          : state.screen === "achievements" || state.screen === "leaderboard" ? "ilerlemem" : "modlar";
    if (firstNavigationRender.current) {
      firstNavigationRender.current = false;
      if (navigation.initial !== null && navigation.initial !== key) navigation.report(key, { replace: true });
      return;
    }
    if (externalScreen.current === state.screen) {
      externalScreen.current = null;
      return;
    }
    navigation.report(key);
  }, [navigation, state.mode, state.screen]);

  // A4: en iyi puan cihaz-yerel depoya yazılır (kaynak: localStorage; portta StoragePort).
  useEffect(() => {
    saveBestScore(storage, state.bestScore);
  }, [storage, state.bestScore]);

  // Kaynak `attachAutoFlush` + `pagehide` portu: dinleyiciler tek kayıt listesine bağlanır ve
  // unmount'ta düşürülür (§7.5). `init` StrictMode çift mount'ta bir kez çalışır.
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

  // Kaynak davranışı: ilerleme yalnız bu alanlar değişince yazılır (her render'da değil);
  // başlangıç ekranlarında yazılmaz. `state` bağımlılık listesine bilinçli olarak girmez.
  useEffect(() => {
    if (state.screen === "start" || state.screen === "modes") return;
    simRuntime.saveProgress(buildSuspend(state));
  }, [state.mode, state.caseIndex, state.step, state.attempts, state.tutorialDone, simRuntime]);

  // A4: toplam öğrenme süresi yalnız simülasyon ekranında işler; unmount ticker'ı keser.
  useEffect(() => {
    if (state.screen !== "simulation") return;
    return lifecycle.startTicker(TIMER_INTERVAL_MS, () => dispatch({ type: "timer", deltaMs: TIMER_INTERVAL_MS }));
  }, [dispatch, lifecycle, state.screen]);

  const value: StoreContextValue = { state, dispatch, bus, runtime: simRuntime, now, storage, env };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
