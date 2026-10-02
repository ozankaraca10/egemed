import type { JSX } from "react";
import { t } from "@egemed/ui/i18n";

interface EgemedLogoProps {
  readonly variant: "on-dark" | "on-light";
  readonly compact?: boolean;
}

/** Kurumsal EGEMED logo dosyaları (`public/brand`); boyutlar dosyaların gerçek piksel boyutudur. */
const LOGO_FILES = {
  "on-dark": { full: { src: "/brand/egemed-horizontal-white.png", width: 335, height: 112 }, compact: { src: "/brand/egemed-icon-white.png", width: 256, height: 256 } },
  "on-light": { full: { src: "/brand/egemed-horizontal.png", width: 320, height: 112 }, compact: { src: "/brand/egemed-icon.png", width: 256, height: 256 } },
} as const;

/** EGEMED marka kilidi: tek erişilebilir ad, dekoratif logo görseli ve alt yazı. */
export function EgemedLogo({ variant, compact = false }: EgemedLogoProps): JSX.Element {
  const className = `eg-shell-logo eg-shell-logo--${variant}${compact ? " eg-shell-logo--compact" : ""}`;
  const file = LOGO_FILES[variant][compact ? "compact" : "full"];
  return (
    <span aria-label={t("shell.brand.full")} className={className} role="img">
      <img alt="" aria-hidden="true" className="eg-shell-logo__mark" height={file.height} src={file.src} width={file.width} />
      {!compact && (
        <span aria-hidden="true" className="eg-shell-logo__tagline">
          {t("shell.brand.tagline")}
        </span>
      )}
    </span>
  );
}
