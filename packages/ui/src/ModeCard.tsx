import { useId, type JSX, type ReactNode } from "react";

/**
 * Mod kimliği; renkler aile token'larından gelir: learn yeşil, practice mavi,
 * assessment mor (docs/02-ekranlar.md §2). Kimlik kart, başlık, işaret ve CTA
 * arasında aynı kalır.
 */
export type ModeTone = "learn" | "practice" | "assessment";

/** Sayı + durum metni; `label` ör. "EKG sonucu izlendi". */
export interface ModeCardProgress {
  readonly current: number;
  readonly total: number;
  readonly label: string;
}

/** Kart başlığında izin verilen başlık düzeyleri (Card.tsx deseni). */
const headingTags = { 2: "h2", 3: "h3", 4: "h4" } as const;

interface ModeCardBaseProps {
  readonly tone: ModeTone;
  readonly title: string;
  readonly description: string;
  /** Kısa madde listesi; onay işareti dekoratiftir, bilgiyi metin taşır. */
  readonly items?: readonly string[];
  readonly progress: ModeCardProgress;
  /** CTA metni; yön oku bileşen tarafından dekoratif eklenir. */
  readonly actionLabel: string;
  readonly onAction: () => void;
  readonly headingLevel?: 2 | 3 | 4;
  /** Dekoratif simge (mod adı başlıkta); ekran okuyucudan gizlenir. */
  readonly icon?: ReactNode;
  readonly className?: string;
}

/** Açık kart. */
export interface ModeCardOpenProps extends ModeCardBaseProps {
  readonly locked?: false;
}

/**
 * Kilitli kart: gizlenmez ve devre dışı bırakılmaz. CTA ön koşul görünümünü
 * hedefler; neden `aria-describedby` ile durum satırına bağlanır.
 */
export interface ModeCardLockedProps extends ModeCardBaseProps {
  readonly locked: true;
  /** Kilit rozeti metni (ör. "Kilitli"); bilgi renk dışında metinle verilir. */
  readonly lockedLabel: string;
  /** Kilit nedeni; durum satırında ilerleme sayısının önüne yazılır. */
  readonly lockReason: string;
}

export type ModeCardProps = ModeCardOpenProps | ModeCardLockedProps;

/** İlerleme sayacını [0, total] aralığına kilitler; geçersiz toplamda 0. */
export function clampProgress(current: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const value = Number.isFinite(current) ? current : 0;
  return Math.min(Math.max(value, 0), total);
}

/** İlerleme yüzdesi (0-100 tam sayı); geçersiz toplamda 0. */
export function progressPercent(current: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((clampProgress(current, total) / total) * 100);
}

/**
 * Mod seçim kartı: üç ton, madde listesi, sayı + `role="progressbar"`
 * ilerleme ve CTA. Üç kart yan yana düzeni için `.eg-mode-card-grid` sınıfı
 * kullanılır (1024 px altında tek kolon). Tüm arayüz metinleri props'tan
 * gelir; i18n çözümü tüketicidedir.
 */
export function ModeCard(props: ModeCardProps): JSX.Element {
  const {
    tone,
    title,
    description,
    items,
    progress,
    actionLabel,
    onAction,
    headingLevel = 3,
    icon,
    className,
  } = props;
  const lockedProps = props.locked === true ? props : null;
  const titleId = useId();
  const statusId = useId();
  const Heading = headingTags[headingLevel];
  const current = clampProgress(progress.current, progress.total);
  const percent = progressPercent(progress.current, progress.total);
  const hasProgress = Number.isFinite(progress.total) && progress.total > 0;
  const statusText = `${current}/${progress.total} ${progress.label}`;
  const classes = className === undefined ? "eg-mode-card" : `eg-mode-card ${className}`;

  return (
    <article
      aria-labelledby={titleId}
      className={classes}
      data-locked={lockedProps === null ? "false" : "true"}
      data-tone={tone}
    >
      {icon === undefined && lockedProps === null ? null : (
        <div className="eg-mode-card__head">
          {icon === undefined ? null : (
            <span aria-hidden="true" className="eg-mode-card__icon">
              {icon}
            </span>
          )}
          {lockedProps === null ? null : (
            <span className="eg-mode-card__lock">{lockedProps.lockedLabel}</span>
          )}
        </div>
      )}
      <Heading className="eg-mode-card__title" id={titleId}>
        {title}
      </Heading>
      <p className="eg-mode-card__desc">{description}</p>
      {items === undefined || items.length === 0 ? null : (
        <ul className="eg-mode-card__items">
          {items.map((item, index) => (
            <li className="eg-mode-card__item" key={`${index}-${item}`}>
              <span aria-hidden="true" className="eg-mode-card__check">
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
      )}
      <p className="eg-mode-card__status" id={statusId}>
        {lockedProps === null ? null : <>{lockedProps.lockReason} — </>}
        {statusText}
      </p>
      {hasProgress ? (
        <div
          aria-labelledby={statusId}
          aria-valuemax={progress.total}
          aria-valuemin={0}
          aria-valuenow={current}
          aria-valuetext={statusText}
          className="eg-mode-card__progress"
          role="progressbar"
        >
          <span
            aria-hidden="true"
            className="eg-mode-card__bar"
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
      <button
        aria-describedby={lockedProps === null ? undefined : statusId}
        className="eg-mode-card__action"
        onClick={onAction}
        type="button"
      >
        {actionLabel}
        <span aria-hidden="true" className="eg-mode-card__arrow">
          →
        </span>
      </button>
    </article>
  );
}
