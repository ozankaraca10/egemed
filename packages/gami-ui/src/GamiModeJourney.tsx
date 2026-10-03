import type { ReactNode } from "react";
import type { GamiIcons } from "./types";

/**
 * T289 — Üç simin ortak mod seçim ekranı (depo sahibi onayı, 30 Eyl 2026).
 * Dört mod bir yolculuk olarak dizilir: Öğrenme (yeşil) → Uygulama (mavi) →
 * Değerlendirme (mor) → Meydan Okuma (altın, koyu kart). Kilitli kartta açılma
 * koşulu mühür olarak görünür; değerlendirme kartında aylık ödül şeridi; altta
 * adil oyun kuralı. Sim yalnız veriyi ve eylemleri verir; görünüm burada.
 */

export type GamiModeKey = "learn" | "practice" | "assessment" | "challenge";

export interface GamiModeCard {
  readonly key: GamiModeKey;
  readonly title: string;
  readonly description: string;
  readonly bullets: readonly string[];
  /** Öğrenme kartında konunun/modun tamamlanma ölçütü (ör. "Her filmi en az 15 sn inceleyin"). */
  readonly criterion?: string;
  /** Kart altındaki durum satırı (ör. "En iyi puan: 84", "Henüz denenmedi", "12 G · 3 B · 5 M"). */
  readonly status?: string;
  /** Öğrenme kartındaki ilerleme (0–1); diğer kartlarda verilmez. */
  readonly progress?: number;
  /** Öğrenme kilidi: kart soluk, mühürde koşul, düğme pasif. */
  readonly learnLocked?: boolean;
  /** Kitle kilidi (ziyaretçi): kart soluk, düğme girişe yönlendirir (pasif değil). */
  readonly audienceLocked?: boolean;
  /** Kilitliyken mühürdeki metin. */
  readonly lockText?: string;
  /** Düğme etiketi; sim kilit durumuna göre verir. */
  readonly cta: string;
  /** Veri eksikliği ya da öğrenme kilidi: düğme pasif. */
  readonly disabled?: boolean;
  readonly onSelect: () => void;
  /** Değerlendirme kartının üst şeridi (ör. "Bu ayın ödülü · ilk 3 kişiye"). */
  readonly ribbon?: string | null;
  /** Kart içine ek içerik (ör. mevcut ödül bağlantısı). */
  readonly extra?: ReactNode;
}

export interface GamiModeJourneyProps {
  readonly simLabel: string;
  readonly title?: string;
  /** Öğrenme ilerlemesi: "12/33 konu incelendi". */
  readonly learnDone: number;
  readonly learnTotal: number;
  readonly learnUnit: string;
  readonly note?: string | null;
  /** Başlık ile kartlar arasına ek içerik (ör. ziyaretçi bandı, öğretim üyesi notu). */
  readonly banner?: ReactNode;
  readonly cards: readonly GamiModeCard[];
  readonly showFairPlay: boolean;
  readonly icons: Pick<GamiIcons, "book" | "target" | "chart" | "award" | "lock" | "gift" | "info" | "arrowRight" | "check">;
}

const STEP_LABEL: Record<GamiModeKey, string> = {
  learn: "1 · ÖĞRENME",
  practice: "2 · UYGULAMA",
  assessment: "3 · DEĞERLENDİRME",
  challenge: "4 · MEYDAN OKUMA",
};

export const GAMI_FAIR_PLAY_TEXT =
  "XP kazandıran hiçbir etkinlikte (uygulama, değerlendirme, Meydan Okuma) yapay zekâ ajanları, otomasyon araçları veya başkasının yardımı kullanılamaz. Platform, bu tür kullanımı tespit eden ölçümler içerir. İhlal tespit edilirse liderlik tablosu, rozetler, aylık ödüller ve Meydan Okuma dahil rekabet içeren tüm alanlardan engellenirsiniz.";

export function GamiFairPlay({ icon }: { readonly icon: ReactNode }) {
  return (
    <div className="eg-gami-fair" role="note">
      <span className="eg-gami-fair-ic" aria-hidden="true">{icon}</span>
      <p><b>Adil oyun kuralı.</b> {GAMI_FAIR_PLAY_TEXT}</p>
    </div>
  );
}

export function GamiModeJourney({ simLabel, title = "Çalışma Modunu Seçin", learnDone, learnTotal, learnUnit, note, banner, cards, showFairPlay, icons }: GamiModeJourneyProps) {
  const pct = learnTotal > 0 ? Math.round((learnDone / learnTotal) * 100) : 0;
  const complete = learnTotal > 0 && learnDone >= learnTotal;
  const iconFor = (key: GamiModeKey) => {
    const size = { width: 26, height: 26 };
    return key === "learn" ? icons.book(size) : key === "practice" ? icons.target(size) : key === "assessment" ? icons.chart(size) : icons.award(size);
  };
  return (
    <div className="eg-gami-journey-wrap">
      <div className="eg-gami-journey-head">
        <span className="eg-gami-journey-eyebrow">{simLabel}</span>
        <h2 className="mode-title eg-gami-journey-title" tabIndex={-1}>{title}</h2>
        <div className="eg-gami-journey-strip">
          <span className={`eg-gami-journey-ring${complete ? " done" : ""}`} style={{ ["--p" as string]: String(pct) }} aria-hidden="true">
            <span>{complete ? "✓" : `${pct}%`}</span>
          </span>
          <span className="eg-gami-journey-strip-t">
            <b>{learnDone}/{learnTotal}</b> {learnUnit} · {complete ? "Tüm modlar açık" : "Öğrenmeyi tamamlayınca diğer modlar açılır"}
          </span>
        </div>
        {note ? <p className="eg-gami-journey-note">{icons.info({ width: 14, height: 14 })} {note}</p> : null}
        {banner}
      </div>
      <ol className="eg-gami-journey mode-cards" aria-label="Çalışma modları">
        {cards.map((card) => {
          const locked = card.learnLocked === true || card.audienceLocked === true;
          return (
          <li
            key={card.key}
            className={`mode-card ${card.key}${card.learnLocked ? " learn-locked" : ""}${card.audienceLocked ? " audience-locked" : ""} eg-gami-mode m-${card.key}${locked ? " locked" : ""}`}
            data-learn-locked={card.learnLocked ? "true" : "false"}
            data-audience-locked={card.audienceLocked ? "true" : "false"}
          >
            {card.ribbon ? <span className="eg-gami-mode-ribbon">{icons.gift({ width: 14, height: 14 })} {card.ribbon}</span> : null}
            <div className="eg-gami-mode-top">
              <span className="eg-gami-mode-medal" aria-hidden="true">{iconFor(card.key)}</span>
              <span className="eg-gami-mode-step">{STEP_LABEL[card.key]}</span>
            </div>
            <h3 className="eg-gami-mode-title">{card.title}</h3>
            {card.key === "challenge" ? (
              <span className="eg-gami-mode-vs" aria-hidden="true"><i className="a">SEN</i><em>VS</em><i className="b">?</i></span>
            ) : null}
            <p className="eg-gami-mode-desc">{card.description}</p>
            <ul className="eg-gami-mode-list">
              {card.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
            </ul>
            {card.criterion ? (
              <p className="eg-gami-mode-criterion"><b>Tamamlama ölçütü</b>{card.criterion}</p>
            ) : null}
            {card.extra}
            <div className="eg-gami-mode-status">
              {locked && card.lockText ? (
                <p className="eg-gami-mode-seal mode-lock-hint" role="status"><span className="lk" aria-hidden="true">{icons.lock({ width: 14, height: 14 })}</span>{card.lockText}</p>
              ) : null}
              {card.progress !== undefined ? (
                <>
                  <span>{learnDone}/{learnTotal} {learnUnit}</span>
                  <span className="eg-gami-mode-bar" aria-hidden="true"><i style={{ width: `${Math.round(card.progress * 100)}%` }} /></span>
                </>
              ) : card.status ? <span>{card.status}</span> : null}
            </div>
            <button className="eg-gami-mode-cta" type="button" disabled={card.disabled === true} onClick={card.onSelect}>
              {locked ? icons.lock({ width: 16, height: 16 }) : null}
              {card.cta}
              {locked ? null : icons.arrowRight({ width: 16, height: 16 })}
            </button>
          </li>
          );
        })}
      </ol>
      {showFairPlay ? <GamiFairPlay icon={icons.check({ width: 14, height: 14 })} /> : null}
    </div>
  );
}
