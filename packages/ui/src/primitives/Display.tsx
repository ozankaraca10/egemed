import type { CSSProperties, JSX, ReactNode } from "react";
import { cx } from "./props";

/** Ad-soyaddan baş harfler (Türkçe büyük harf kuralıyla, en fazla iki harf). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);
  const letters = (words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1)).map((word) => (word ?? "").charAt(0));
  return letters.join("").toLocaleUpperCase("tr-TR") || "?";
}

export interface AvatarProps {
  readonly name: string;
  readonly size?: number;
  readonly className?: string;
}

/** Baş harfli avatar; süsleyicidir (ad yanında ayrıca yazılır). */
export function Avatar({ name, size = 36, className }: AvatarProps): JSX.Element {
  const style: CSSProperties = { inlineSize: size, blockSize: size, fontSize: Math.round(size * 0.4) };
  return (
    <span className={cx("eg-avatar", className)} style={style} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/** Yükleniyor iskeleti; yükleme durumu çağıranda `aria-busy` ile duyurulur. */
export function Skeleton({ width = "100%", height = 16, radius, className }: { readonly width?: number | string; readonly height?: number | string; readonly radius?: number | string; readonly className?: string }): JSX.Element {
  const style: CSSProperties = { inlineSize: width, blockSize: height, ...(radius !== undefined ? { borderRadius: radius } : {}) };
  return <span className={cx("eg-skeleton", className)} style={style} aria-hidden="true" />;
}

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}

/** Boş durum: ne olduğunu ve sonraki adımı söyler. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div className={cx("eg-empty", className)}>
      {icon !== undefined ? <span className="eg-empty__icon" aria-hidden="true">{icon}</span> : null}
      <p className="eg-empty__title">{title}</p>
      {description !== undefined ? <p className="eg-empty__desc">{description}</p> : null}
      {action !== undefined ? <div className="eg-empty__action">{action}</div> : null}
    </div>
  );
}
