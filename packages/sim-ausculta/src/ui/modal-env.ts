/** Modal pencere/belge sınırı. Odak tuzağı, Esc ve odak dönüşü yalnız bu yüzeyden geçer.
 *  Paket içinde doğrudan `document` erişimi yoktur. Üretimde kabuk gerçek vekili enjekte eder. */

export interface ModalFocusable {
  focus(): void;
  hasAttribute(name: string): boolean;
}

export interface ModalKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault(): void;
}

export interface ModalEnv {
  readonly activeElement: ModalFocusable | null;
  addEventListener(type: "keydown", handler: (event: ModalKeyEvent) => void): void;
  removeEventListener(type: "keydown", handler: (event: ModalKeyEvent) => void): void;
  queryFocusables(root: unknown, selector: string): ModalFocusable[];
}

export function createNoopModalEnv(): ModalEnv {
  return {
    activeElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    queryFocusables: () => [],
  };
}

export const NOOP_MODAL_ENV: ModalEnv = createNoopModalEnv();

/** Kaynak: HelpModal / PediatricRefModal `querySelectorAll` seçicisi. */
export const MODAL_FOCUSABLE_SELECTOR = 'button, a[href], input, [tabindex]:not([tabindex="-1"])';

export type TabTrapTarget = "first" | "last" | null;

export function tabTrapTarget(shiftKey: boolean, active: unknown, first: unknown, last: unknown): TabTrapTarget {
  if (shiftKey) return active === first ? "last" : null;
  return active === last ? "first" : null;
}

export function enabledFocusables(env: ModalEnv, root: unknown, selector: string): ModalFocusable[] {
  return env.queryFocusables(root, selector).filter((el) => !el.hasAttribute("disabled"));
}

/** Açılışta `initial` odaklanır; kapanış önceki odağa döner. Esc kapatır, Tab sarar. */
export function bindModalFocus(options: {
  env: ModalEnv;
  initial: ModalFocusable | null;
  focusables: () => readonly ModalFocusable[];
  onDismiss: () => void;
}): () => void {
  const prev = options.env.activeElement;
  options.initial?.focus();
  const onKey = (event: ModalKeyEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      options.onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    const list = options.focusables();
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    const target = tabTrapTarget(event.shiftKey, options.env.activeElement, first, last);
    if (target === "last") {
      event.preventDefault();
      last.focus();
    } else if (target === "first") {
      event.preventDefault();
      first.focus();
    }
  };
  options.env.addEventListener("keydown", onKey);
  return () => {
    options.env.removeEventListener("keydown", onKey);
    prev?.focus();
  };
}
