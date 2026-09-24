import { useEffect, useRef, type ReactNode } from 'react'
import { NOOP_MODAL_ENV, tabTrapTarget, type ModalEnv, type ModalFocusable, type ModalKeyEvent } from './modal-env'

/** Küçük onay penceresi (§ O6). HelpModal ile aynı desen: ESC kapatır, odak yönetimi
 *  yapılır (açılışta ilk odaklanılabilir öğeye taşınır, kapanışta önceki odağa döner).
 *  A1: isteğe bağlı `children` (ör. "Tekrar sorma" onay kutusu) mesaj ile eylem satırı
 *  arasına eklenir; odak tuzağı bu ek denetimleri de kapsayacak şekilde dinamik hesaplanır.
 *
 *  Port notu (E2 §8 S9): pencere/belge erişimi `ModalEnv` ile enjekte edilir (S7/S8 deseni);
 *  varsayılan güvenli no-op'tur. Kaynak davranış (Esc, sekme tuzağı, odak dönüşü) birebir korunur. */
export interface ConfirmModalProps {
  readonly open: boolean
  readonly title: string
  readonly message: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
  readonly children?: ReactNode
  /** Belge sınırı; verilmezse güvenli no-op (SSR/statik render). */
  readonly env?: ModalEnv
}

/** Kaynak: `'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'`. */
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Çık',
  cancelLabel = 'Vazgeç',
  onConfirm,
  onCancel,
  children,
  env = NOOP_MODAL_ENV,
}: ConfirmModalProps) {
  const cardRef = useRef<unknown>(null)
  const cancelRef = useRef<ModalFocusable | null>(null)
  const prevFocusRef = useRef<ModalFocusable | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocusRef.current = env.activeElement
    cancelRef.current?.focus()
    const onKey = (e: ModalKeyEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        const focusables = env.queryFocusables(cardRef.current, FOCUSABLE_SELECTOR)
        if (!focusables.length) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const target = tabTrapTarget(e.shiftKey, env.activeElement, first, last)
        if (target === 'last') {
          e.preventDefault()
          last?.focus()
        } else if (target === 'first') {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    env.addEventListener('keydown', onKey)
    return () => {
      env.removeEventListener('keydown', onKey)
      prevFocusRef.current?.focus()
    }
  }, [open, onCancel, env])

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="modal-card confirm-modal" ref={(el) => { cardRef.current = el }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>{message}</p>
          {children}
          <div className="confirm-actions">
            <button ref={(el) => { cancelRef.current = el as ModalFocusable | null }} className="btn" onClick={onCancel}>{cancelLabel}</button>
            <button className="btn primary" onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
