import type { JSX, ReactNode } from "react";
import { useEmbedded } from "../EmbeddedContext";

export interface ScreenHeadingProps {
  readonly className?: string;
  readonly id?: string;
  readonly children: ReactNode;
}

/** Ekran ana başlığı: gömülü modda h2, bağımsız modda h1 (aynı sınıf/id). */
export function ScreenHeading({ className, id, children }: ScreenHeadingProps): JSX.Element {
  const embedded = useEmbedded();
  if (embedded) {
    return (
      <h2 className={className} id={id}>
        {children}
      </h2>
    );
  }
  return (
    <h1 className={className} id={id}>
      {children}
    </h1>
  );
}

export interface SectionHeadingProps {
  readonly className?: string;
  readonly id?: string;
  readonly children: ReactNode;
}

/** Bölüm başlığı: gömülü modda h3, bağımsız modda h2 (hiyerarşi kayması). */
export function SectionHeading({ className, id, children }: SectionHeadingProps): JSX.Element {
  const embedded = useEmbedded();
  if (embedded) {
    return (
      <h3 className={className} id={id}>
        {children}
      </h3>
    );
  }
  return (
    <h2 className={className} id={id}>
      {children}
    </h2>
  );
}
