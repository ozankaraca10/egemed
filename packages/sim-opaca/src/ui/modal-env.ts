/** Modal pencere/belge sınırı (E2 §8 S9; S7 `WindowLike`/S8 `ChromeEnv` deseni).
 *  Odak tuzağı, Esc kapatma ve odak geri yükleme yalnız bu yüzeyden geçer; paket içinde
 *  doğrudan `document` erişimi yoktur (ADR-006). Üretimde kabuk gerçek `document` vekilini
 *  enjekte eder; testler sahte nesne verir. Kimlik mount boyunca sabit olmalıdır
 *  (dinleyici effect'inin bağımlılığıdır). */

/** Odaklanabilir öğe yüzeyi (kaynak: `HTMLElement` — yalnız kullanılan üyeler). Paket DOM
 *  lib'i taşımadığından `@types/react`'in asgari global DOM arayüzleri boştur; ref geri
 *  çağrıları bu yapısal tipe çevrilir (üretimde gerçek düğüm bu üyeleri taşır). */
export interface ModalFocusable {
  focus(): void
  hasAttribute(name: string): boolean
}

/** Klavye olayı yüzeyi (kaynak: `KeyboardEvent`). */
export interface ModalKeyEvent {
  readonly key: string
  readonly shiftKey: boolean
  preventDefault(): void
}

/** Belge sınırı: aktif öğe, `keydown` kaydı ve kart kapsamlı odaklanabilir sorgusu.
 *  `activeElement` üretimde canlı okunmalıdır (getter); kapanışta odağın geri
 *  yüklenmesi ve sekme tuzağı karşılaştırması buna dayanır. */
export interface ModalEnv {
  readonly activeElement: ModalFocusable | null
  addEventListener(type: 'keydown', handler: (event: ModalKeyEvent) => void): void
  removeEventListener(type: 'keydown', handler: (event: ModalKeyEvent) => void): void
  /** Kaynak: `card.querySelectorAll(selector)` — kart DOM düğümü opak kök olarak geçer. */
  queryFocusables(root: unknown, selector: string): ModalFocusable[]
}

/** Güvenli varsayılan: odak yok, dinleyici yok, odaklanabilir öğe yok (SSR/statik render). */
export function createNoopModalEnv(): ModalEnv {
  return {
    activeElement: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    queryFocusables: () => [],
  }
}

export const NOOP_MODAL_ENV: ModalEnv = createNoopModalEnv()

/** Sekme tuzağı hedefi: kaynak davranışı birebir — Shift+Tab ilk öğeden sona,
 *  Tab son öğeden ilke sarar; aradaki konumlarda tarayıcı varsayılanı işler. */
export type TabTrapTarget = 'first' | 'last' | null

export function tabTrapTarget(shiftKey: boolean, active: unknown, first: unknown, last: unknown): TabTrapTarget {
  if (shiftKey) return active === first ? 'last' : null
  return active === last ? 'first' : null
}
