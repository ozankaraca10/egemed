import type { JSX } from "react";
import { t } from "@egemed/ui/i18n";

export interface EgemedLogoProps {
  readonly variant: "on-dark" | "on-light";
  readonly compact?: boolean;
}

/** EGEMED marka kilidi: tek erişilebilir ad, dekoratif işaret ve yazı. */
export function EgemedLogo({ variant, compact = false }: EgemedLogoProps): JSX.Element {
  const className = `eg-shell-logo eg-shell-logo--${variant}${compact ? " eg-shell-logo--compact" : ""}`;
  return (
    <span aria-label={t("shell.brand.full")} className={className} role="img">
      <svg
        aria-hidden="true"
        className="eg-shell-logo__mark"
        fill="none"
        viewBox="0 0 48 48"
      >
        <rect className="eg-shell-logo__tile" height="46" rx="13" width="46" x="1" y="1" />
        <path
          className="eg-shell-logo__line"
          d="M7 25h8l4-10 6 19 5-14 3 5h4a4 4 0 1 0-4-4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.6"
        />
      </svg>
      <span aria-hidden="true" className="eg-shell-logo__copy">
        <strong className="eg-shell-logo__name">EGEMED</strong>
        {!compact && <span className="eg-shell-logo__tagline">Klinik Öğrenme Deneyimi Platformu</span>}
      </span>
    </span>
  );
}
