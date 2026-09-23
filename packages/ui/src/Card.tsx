import { useId, type JSX, type ReactNode } from "react";

/** Kart başlığında izin verilen başlık düzeyleri. */
const headingTags = { 2: "h2", 3: "h3", 4: "h4" } as const;

export interface CardProps {
  children: ReactNode;
  title?: string;
  headingLevel?: 2 | 3 | 4;
  footer?: ReactNode;
  className?: string;
}

/**
 * Bölüm kartı. `title` verilirse başlık `aria-labelledby` ile karta bağlanır;
 * başlık düzeyi `headingLevel` ile seçilir (varsayılan 2).
 */
export function Card({
  children,
  title,
  headingLevel = 2,
  footer,
  className,
}: CardProps): JSX.Element {
  const headingId = useId();
  const Heading = headingTags[headingLevel];
  const classes = className === undefined ? "eg-card" : `eg-card ${className}`;
  const hasTitle = title !== undefined && title.length > 0;
  return (
    <section aria-labelledby={hasTitle ? headingId : undefined} className={classes}>
      {hasTitle ? (
        <Heading className="eg-card__title" id={headingId}>
          {title}
        </Heading>
      ) : null}
      <div className="eg-card__body">{children}</div>
      {footer === undefined ? null : <div className="eg-card__footer">{footer}</div>}
    </section>
  );
}
