import { useEffect, useRef } from "react";
import { IconClose } from "./icons";
import { TutorialSteps } from "./TutorialSteps";
import {
  bindModalFocus,
  enabledFocusables,
  MODAL_FOCUSABLE_SELECTOR,
  NOOP_MODAL_ENV,
  type ModalEnv,
  type ModalFocusable,
} from "./modal-env";

/** Yardım penceresi. X, Esc veya arka plan kapatır. İçerik TutorialSteps ile tekilleşir. */
export interface HelpModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly env?: ModalEnv;
}

const HIT = { minWidth: 44, minHeight: 44 } as const;

export function HelpModal({ open, onClose, env = NOOP_MODAL_ENV }: HelpModalProps) {
  const closeRef = useRef<ModalFocusable | null>(null);
  const cardRef = useRef<unknown>(null);

  useEffect(() => {
    if (!open) return;
    return bindModalFocus({
      env,
      initial: closeRef.current,
      focusables: () => enabledFocusables(env, cardRef.current, MODAL_FOCUSABLE_SELECTOR),
      onDismiss: onClose,
    });
  }, [open, onClose, env]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Yardım" onClick={onClose}>
      <div className="modal-card help-modal" ref={(el) => { cardRef.current = el; }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Nasıl Kullanılır?</h3>
          <button
            ref={(el) => { closeRef.current = el as ModalFocusable | null; }}
            className="modal-close"
            style={HIT}
            onClick={onClose}
            aria-label="Yardım penceresini kapat"
            title="Kapat"
          >
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <TutorialSteps />
          <div className="help-tips">
            <b>İpuçları</b>
            <ul>
              <li>En iyi deneyim için kulaklık kullanın; ses düzeyi denetimi alt araç çubuğundadır, başlangıç ekranında kulaklık test tonu vardır.</li>
              <li>Bölge listesini klavyeyle de kullanabilirsiniz (Tab ile odaklanın).</li>
              <li>Çalma sırasında sağdaki paneldeki Dalga Formu sekmesi ve turuncu ipucu düğmesi öğrenmeyi destekler.</li>
              <li>Geliştiriciler, kaynaklar ve lisanslar için üstteki “Hakkında” düğmesine bakın.</li>
            </ul>
          </div>
          <p className="help-note">Bu simülatör eğitim amaçlıdır; tanı koydurmaz. Klinik karar her zaman hasta bağlamıyla verilir.</p>
        </div>
      </div>
    </div>
  );
}
