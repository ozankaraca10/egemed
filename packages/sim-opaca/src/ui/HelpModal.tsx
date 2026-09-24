import { useEffect, useRef } from 'react'
import { IconClose } from './icons'
import { TutorialSteps } from './TutorialSteps'
import { NOOP_MODAL_ENV, tabTrapTarget, type ModalEnv, type ModalFocusable, type ModalKeyEvent } from './modal-env'

/** Yardım penceresi (popup). Üstteki "Yardım" düğmesinden açılır; X, ESC veya
 *  arka plana tıklayarak kapanır. madde 6 (wave 2): içerik artık TutorialScreen ile aynı
 *  TutorialSteps bileşenini kullanır (tekilleştirme) + altında "İpuçları" bloğu.
 *
 *  Port notu (E2 §8 S9): pencere/belge erişimi `ModalEnv` ile enjekte edilir (S7/S8 deseni);
 *  varsayılan güvenli no-op'tur. Kaynak davranış (Esc, sekme tuzağı, odak dönüşü) birebir korunur. */
export interface HelpModalProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Belge sınırı; verilmezse güvenli no-op (SSR/statik render). */
  readonly env?: ModalEnv
}

/** Kaynak: `'button, a[href], input, [tabindex]:not([tabindex="-1"])'`. */
const FOCUSABLE_SELECTOR = 'button, a[href], input, [tabindex]:not([tabindex="-1"])'

export function HelpModal({ open, onClose, env = NOOP_MODAL_ENV }: HelpModalProps) {
  const closeRef = useRef<ModalFocusable | null>(null)
  const cardRef = useRef<unknown>(null)
  const prevFocusRef = useRef<ModalFocusable | null>(null)

  useEffect(() => {
    if (!open) return
    // D2: açılışta odak kapat düğmesine taşınır, kapanışta önceki odağa döner
    prevFocusRef.current = env.activeElement
    closeRef.current?.focus()
    const onKey = (e: ModalKeyEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'Tab') {
        const focusables = env.queryFocusables(cardRef.current, FOCUSABLE_SELECTOR).filter((el) => !el.hasAttribute('disabled'))
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
  }, [open, onClose, env])

  if (!open) return null

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Yardım" onClick={onClose}>
      <div className="modal-card help-modal" ref={(el) => { cardRef.current = el }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Nasıl Kullanılır?</h3>
          <button ref={(el) => { closeRef.current = el as ModalFocusable | null }} className="modal-close" onClick={onClose} aria-label="Yardım penceresini kapat" title="Kapat">
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <TutorialSteps />
          <div className="help-tips">
            <b>İpuçları</b>
            <ul>
              <li>Görüntüleyici klavyeyle de kullanılır: Tab ile odaklanın, ok tuşlarıyla kaydırın, + / − ile yakınlaştırın, 0 ile sıfırlayın.</li>
              <li>Okuma bölgesi çiplerine tıklamak filmi o bölgeye yakınlaştırır.</li>
              <li>Kardiyotorasik oranı yalnız PA filmde yorumlayın; projeksiyon bilgisi olgu kartında yazar.</li>
              <li>Geliştiriciler, veri setleri ve lisanslar için üstteki “Hakkında” düğmesine bakın.</li>
            </ul>
          </div>
          <p className="help-note">Bu simülatör eğitim amaçlıdır; tanı koydurmaz. Klinik karar her zaman hasta bağlamıyla verilir.</p>
        </div>
      </div>
    </div>
  )
}
