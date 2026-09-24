import { useEffect, useRef } from "react";
import { bindModalFocus, NOOP_MODAL_ENV, type ModalEnv, type ModalFocusable } from "./modal-env";

/** Küçük onay penceresi. Esc kapatır; açılışta Vazgeç odaklanır, kapanışta önceki odağa döner. */
export interface ConfirmModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly env?: ModalEnv;
}

const HIT = { minWidth: 44, minHeight: 44 } as const;

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Çık",
  cancelLabel = "Vazgeç",
  onConfirm,
  onCancel,
  env = NOOP_MODAL_ENV,
}: ConfirmModalProps) {
  const cancelRef = useRef<ModalFocusable | null>(null);
  const confirmRef = useRef<ModalFocusable | null>(null);

  useEffect(() => {
    if (!open) return;
    return bindModalFocus({
      env,
      initial: cancelRef.current,
      focusables: () => [cancelRef.current, confirmRef.current].filter((el): el is ModalFocusable => el !== null),
      onDismiss: onCancel,
    });
  }, [open, onCancel, env]);

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onCancel}>
      <div className="modal-card confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0 }}>{message}</p>
          <div className="confirm-actions">
            <button ref={(el) => { cancelRef.current = el as ModalFocusable | null; }} className="btn" style={HIT} onClick={onCancel}>{cancelLabel}</button>
            <button ref={(el) => { confirmRef.current = el as ModalFocusable | null; }} className="btn primary" style={HIT} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
