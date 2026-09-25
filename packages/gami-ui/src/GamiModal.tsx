import { useEffect, useRef, type ReactNode } from "react";
import { NOOP_GAMI_MODAL_ENV, gamiTabTrapTarget, type GamiFocusable, type GamiKeyEvent, type GamiModalEnv } from "./modal";
import type { GamiIcon } from "./types";

const FOCUSABLE_SELECTOR = "button, [href], input, select, [tabindex]:not([tabindex=\"-1\"])";

export function GamiModal({ title, onClose, returnTo, children, env = NOOP_GAMI_MODAL_ENV, closeIcon }: {
  title: string;
  onClose: () => void;
  returnTo?: GamiFocusable | null;
  children: ReactNode;
  env?: GamiModalEnv;
  closeIcon: ReactNode;
}) {
  const cardRef = useRef<unknown>(null);
  const closeRef = useRef<GamiFocusable | null>(null);
  const prevFocusRef = useRef<GamiFocusable | null>(null);
  useEffect(() => {
    prevFocusRef.current = returnTo ?? env.activeElement;
    closeRef.current?.focus();
    const onKey = (e: GamiKeyEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const focusables = env.queryFocusables(cardRef.current, FOCUSABLE_SELECTOR);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const target = gamiTabTrapTarget(e.shiftKey, env.activeElement, first, last);
      if (target === "last") { e.preventDefault(); last?.focus(); }
      else if (target === "first") { e.preventDefault(); first?.focus(); }
    };
    env.addEventListener("keydown", onKey);
    return () => { env.removeEventListener("keydown", onKey); prevFocusRef.current?.focus(); };
  }, [onClose, returnTo, env]);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="modal-card" ref={(el) => { cardRef.current = el; }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button ref={(el) => { closeRef.current = el as GamiFocusable | null; }} className="modal-close" type="button" aria-label="Kapat" onClick={onClose}>{closeIcon}</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export type { GamiIcon };
