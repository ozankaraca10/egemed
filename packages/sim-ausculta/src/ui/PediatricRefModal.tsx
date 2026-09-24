import { useEffect, useRef } from "react";
import pediatricRef from "../data/pediatric-reference.json";
import { IconClose } from "./icons";
import {
  bindModalFocus,
  enabledFocusables,
  MODAL_FOCUSABLE_SELECTOR,
  NOOP_MODAL_ENV,
  type ModalEnv,
  type ModalFocusable,
} from "./modal-env";

/** Pediatrik referans. Esc ve arka plan kapatır; açılışta kapat düğmesi, kapanışta önceki odak. */
export interface PediatricRefModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly env?: ModalEnv;
}

const HIT = { minWidth: 44, minHeight: 44 } as const;

export function PediatricRefModal({ open, onClose, env = NOOP_MODAL_ENV }: PediatricRefModalProps) {
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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Pediatrik referans değerleri" onClick={onClose}>
      <div className="modal-card" ref={(el) => { cardRef.current = el; }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Pediatrik referans değerleri</h3>
          <button
            ref={(el) => { closeRef.current = el as ModalFocusable | null; }}
            className="modal-close"
            style={HIT}
            onClick={onClose}
            aria-label="Pediatrik referans penceresini kapat"
            title="Kapat"
          >
            <IconClose />
          </button>
        </div>
        <div className="modal-body">
          <p className="ped-note">{pediatricRef.note}</p>
          <table className="ped-table">
            <thead>
              <tr><th>Yaş</th><th>Kalp hızı</th><th>Solunum</th></tr>
            </thead>
            <tbody>
              {pediatricRef.rows.map((r) => (
                <tr key={r.age}><td>{r.age}</td><td>{r.hr}/dk</td><td>{r.rr}/dk</td></tr>
              ))}
            </tbody>
          </table>
          <ul className="ped-notes">
            {pediatricRef.auscultationNotes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
