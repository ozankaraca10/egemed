import { type JSX } from "react";
import { t, type TrKey } from "../i18n/tr";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

/** Ton → sözlük anahtarı; `neutral` bilinçli olarak önek taşımaz. */
const toneKeys: Record<Exclude<BadgeTone, "neutral">, TrKey> = {
  info: "badge.tone.info",
  success: "badge.tone.success",
  warning: "badge.tone.warning",
  danger: "badge.tone.danger",
};

export interface BadgeProps {
  children: string;
  tone?: BadgeTone;
  className?: string;
}

/**
 * Durum rozeti. Bilgi yalnız renkle verilmez: `neutral` dışındaki tonlarda
 * ekran okuyucuya gizli bir ton öneki ve ton başına farklı, ton rengine
 * boyanmış bir şekil (daire/kare/üçgen/elmas) eklenir. Şekil dekoratif
 * değildir; renk körü kullanıcı için tonu ayırt eder ve ekran okuyucudan
 * `aria-hidden` ile gizlenir (bilgiyi önek metni taşır).
 */
export function Badge({ children, tone = "neutral", className }: BadgeProps): JSX.Element {
  const classes = className === undefined ? "eg-badge" : `eg-badge ${className}`;
  const label = tone === "neutral" ? undefined : t(toneKeys[tone]);
  return (
    <span className={classes} data-tone={tone}>
      {label === undefined ? null : (
        <>
          <span className="eg-visually-hidden">{`${label}: `}</span>
          <span aria-hidden="true" className="eg-badge__dot" />
        </>
      )}
      {children}
    </span>
  );
}
