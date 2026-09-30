import * as React from "react";

/** DOM'suz React kanca koşucusu (T271b gezinme testleri).
 *  Depoda DOM kütüphanesi (jsdom vb.) yok; StoreProvider'ın gezinme effect'leri
 *  yalnız gerçek bir renderer'da koşar. Bu koşucu React'in kendi `useRef`,
 *  `useReducer`, `useEffect` girişlerini geçici bir dağıtıcıya (dispatcher)
 *  bağlar; effect'ler gerçek React sırasıyla (render sonrası, bağımlılık
 *  değişiminde, temizlik önce) koşar. Üretim koduna dokunulmaz; sahte olan
 *  yalnız React çalışma zamanının ev sahibidir. */

type Dispatcher = {
  useEffect(create: () => void | (() => void), deps?: readonly unknown[]): void;
  useReducer(
    reduce: (state: unknown, action: unknown) => unknown,
    initialArg: unknown,
    init?: (arg: unknown) => unknown,
  ): readonly [unknown, (action: unknown) => void];
  useRef(initial: unknown): { current: unknown };
};

interface EffectRecord {
  readonly deps: readonly unknown[] | null;
  readonly cleanup: (() => void) | null;
}

interface ReducerRecord {
  reduce: (state: unknown, action: unknown) => unknown;
  state: unknown;
  readonly dispatch: (action: unknown) => void;
}

interface HookSlots {
  cursor: number;
  readonly refs: Array<{ current: unknown } | undefined>;
  readonly effects: Array<EffectRecord | undefined>;
  readonly reducers: Array<ReducerRecord | undefined>;
  pending: Array<() => void>;
  needsRender: boolean;
}

interface ReactInternals {
  H: Dispatcher | null;
}

/** React'in geliştirme derlemesindeki geçerli dağıtıcı yuvası. */
function reactInternals(): ReactInternals {
  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ReactInternals;
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  if (internals === undefined) {
    throw new Error("React istemci içleri bulunamadı; testler React geliştirme derlemesi ister.");
  }
  return internals;
}

function sameDeps(previous: readonly unknown[] | null, next: readonly unknown[] | undefined): boolean {
  if (previous === null || next === undefined || previous.length !== next.length) return false;
  return previous.every((value, index) => Object.is(value, next[index]));
}

export interface HookHarness {
  /** Son render'ın kök elemanı (ör. StoreContext.Provider). */
  readonly tree: unknown;
  /** Yeniden render eder (bağımlılığı değişmeyen effect'ler koşmaz). */
  render(): void;
  /** Tüm effect temizliklerini koşar (React unmount eşdeğeri). */
  unmount(): void;
}

/** Bileşen fonksiyonunu kalıcı kanca yuvalarıyla çağırır; state değişiminde
 *  gerçek React gibi yeniden render eder. Kurulumda ilk render'ı koşar. */
export function createHookHarness<P>(component: (props: P) => unknown, props: P): HookHarness {
  const internals = reactInternals();
  const slots: HookSlots = {
    cursor: 0,
    refs: [],
    effects: [],
    reducers: [],
    pending: [],
    needsRender: false,
  };
  let element: unknown = null;
  let rendering = false;

  const flushEffects = (): void => {
    const pending = slots.pending;
    slots.pending = [];
    for (const run of pending) run();
  };

  const render = (): void => {
    slots.needsRender = true;
    if (rendering) return;
    rendering = true;
    try {
      while (slots.needsRender) {
        slots.needsRender = false;
        slots.cursor = 0;
        internals.H = dispatcher;
        try {
          element = component(props);
        } finally {
          internals.H = null;
        }
        flushEffects();
      }
    } finally {
      rendering = false;
    }
  };

  const dispatcher: Dispatcher = {
    useRef(initial) {
      const index = slots.cursor;
      slots.cursor += 1;
      let record = slots.refs[index];
      if (record === undefined) {
        record = { current: initial };
        slots.refs[index] = record;
      }
      return record;
    },
    useReducer(reduce, initialArg, init) {
      const index = slots.cursor;
      slots.cursor += 1;
      let record = slots.reducers[index];
      if (record === undefined) {
        record = {
          reduce,
          state: typeof init === "function" ? init(initialArg) : initialArg,
          dispatch: (action) => {
            const current = slots.reducers[index];
            if (current === undefined) return;
            current.state = current.reduce(current.state, action);
            render();
          },
        };
        slots.reducers[index] = record;
      } else {
        record.reduce = reduce;
      }
      return [record.state, record.dispatch];
    },
    useEffect(create, deps) {
      const index = slots.cursor;
      slots.cursor += 1;
      const previous = slots.effects[index];
      if (previous !== undefined && sameDeps(previous.deps, deps)) return;
      slots.pending.push(() => {
        previous?.cleanup?.();
        const cleanup = create();
        slots.effects[index] = {
          deps: deps === undefined ? null : deps,
          cleanup: typeof cleanup === "function" ? cleanup : null,
        };
      });
    },
  };

  render();

  return {
    get tree() {
      return element;
    },
    render,
    unmount() {
      for (const effect of slots.effects) effect?.cleanup?.();
      slots.effects.length = 0;
    },
  };
}

/** Context sağlayıcı elemanının değerini okur (`StoreContextValue` vb.). */
export function providerValue<T>(tree: unknown): T {
  return (tree as { props: { value: T } }).props.value;
}
