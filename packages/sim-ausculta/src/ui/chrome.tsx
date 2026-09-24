import type { ReactNode } from "react";

/** Ekranların paylaştığı alt bilgi ve arka plan (kaynak `ui/chrome.tsx` Footer/EcgDeco).
 *  Gömülü modda çizilmez: platform kabuğunun üst barı tek kalır. */

const HIT = { minWidth: 44, minHeight: 44 } as const;

export interface FooterProps {
  readonly embedded?: boolean;
}

export function Footer({ embedded = false }: FooterProps): ReactNode {
  if (embedded) return null;
  return (
    <footer className="eg-footer">
      <div className="footer-left">
        <img src="brand/logo-icon-web.png" alt="" className="footer-seal" />
        <span className="footer-text">
          <span className="footer-brand">EGEMED Ausculta<sup className="tm">™</sup></span>
          <span className="footer-sub"> Kardiyopulmoner Oskültasyon Simülatörü</span>
          <span className="footer-inst">, Ege Üniversitesi Tıp Fakültesi Dekanlığı tarafından geliştirilmiştir.</span>
          <span className="footer-copy"> Tüm hakları saklıdır © 2026</span>
        </span>
      </div>
      <div className="footer-right">
        <span className="footer-attr2">Ses kayıtları: HLS-CMDS v3 · CC BY 4.0 — CirCor · ODC-BY 1.0</span>
      </div>
    </footer>
  );
}

export interface EcgDecoProps {
  readonly embedded?: boolean;
}

export function EcgDeco({ embedded = false }: EcgDecoProps): ReactNode {
  if (embedded) return null;
  return (
    <div className="app-bg" aria-hidden="true">
      <div className="bg-wash" />
    </div>
  );
}

export function touchTarget(): { minWidth: number; minHeight: number } {
  return HIT;
}

/** İlerleme dolgusu genişlik yerine ölçeklenir; düzeni her karede yeniden hesaplamaz. */
export function fillScale(percent: number): { transform: string } {
  const clamped = Math.min(100, Math.max(0, percent)) / 100;
  return { transform: `scaleX(${clamped})` };
}
