import { useEffect, useRef, type ReactNode } from 'react'
import { IconClose } from '../icons'
import { NOOP_MODAL_ENV, tabTrapTarget, type ModalEnv, type ModalFocusable, type ModalKeyEvent } from '../modal-env'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, [tabindex]:not([tabindex="-1"])'

/** Ortak pencere (ConfirmModal kalıbı): Esc kapatır, odak tuzağı, kapanınca odak `returnTo`'ya döner. */
export function GamiModal({ title, onClose, returnTo, children, env = NOOP_MODAL_ENV }: {
  title: string
  onClose: () => void
  returnTo?: ModalFocusable | null
  children: ReactNode
  env?: ModalEnv
}) {
  const cardRef = useRef<unknown>(null)
  const closeRef = useRef<ModalFocusable | null>(null)
  const prevFocusRef = useRef<ModalFocusable | null>(null)
  useEffect(() => {
    prevFocusRef.current = returnTo ?? env.activeElement
    closeRef.current?.focus()
    const onKey = (e: ModalKeyEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const focusables = env.queryFocusables(cardRef.current, FOCUSABLE_SELECTOR)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const target = tabTrapTarget(e.shiftKey, env.activeElement, first, last)
      if (target === 'last') { e.preventDefault(); last?.focus() }
      else if (target === 'first') { e.preventDefault(); first?.focus() }
    }
    env.addEventListener('keydown', onKey)
    return () => { env.removeEventListener('keydown', onKey); prevFocusRef.current?.focus() }
  }, [onClose, returnTo, env])
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal-card" ref={(el) => { cardRef.current = el }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button ref={(el) => { closeRef.current = el as ModalFocusable | null }} className="modal-close" type="button" aria-label="Kapat" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
