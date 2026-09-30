import { useEffect, useState, type JSX } from "react";
import { icons } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";
import { simHref } from "../routes";
import { shellNow } from "../now";
import { daysLeftInMonth, monthLabelTr, type ShowcaseLeader, type ShowcaseSim, type ShowcaseSource } from "./showcaseSource";

/**
 * Ana sayfa liderlik vitrini (26 Eyl 2026): "reklam gibi" çekici blok. Her sim
 * ayrı sütun: marka bandı, "Bu ayın ödülü" şeridi (simdeki görünümle aynı dil),
 * ilk 3 kürsü (2-1-3 dizilimi) ve "İlk 10'u gör" açılımı; altta geçen ayın
 * şampiyonları. Simler arası birleşik sıra yoktur (ADR-006).
 */

function initialsOf(name: string): string {
  const parts = name.replace(/\./g, " ").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : (parts[0] ?? "").slice(0, 2);
  return letters.toLocaleUpperCase("tr-TR") || "?";
}

function scoreText(score: number | null): string {
  return score === null ? "—" : score.toLocaleString("tr-TR", { maximumFractionDigits: 1 });
}

function Podium({ leaders }: { readonly leaders: readonly ShowcaseLeader[] }): JSX.Element {
  // Görsel dizilim 2-1-3; okuma sırası (DOM) 1-2-3 kalır, CSS `order` ile dizilir.
  return (
    <ol aria-label={t("home.showcase.podium")} className="eg-shell-podium">
      {leaders.slice(0, 3).map((leader) => (
        <li className={`eg-shell-podium__place eg-shell-podium__place--${leader.rank}`} key={leader.rank}>
          <span aria-hidden="true" className="eg-shell-podium__avatar">{initialsOf(leader.displayName)}</span>
          <span className="eg-shell-podium__name">
            {leader.displayName}
            {leader.isMe && <span className="eg-shell-podium__me"> · {t("home.showcase.me")}</span>}
          </span>
          <span className="eg-shell-podium__score">{scoreText(leader.score)}</span>
          <span className="eg-shell-podium__step">
            <span className="eg-shell-podium__rank">{leader.rank}</span>
            <span className="eg-shell-visually-hidden">. {t("home.showcase.place")}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function SimColumn({ sim, now }: { readonly sim: ShowcaseSim; readonly now: number }): JSX.Element {
  const rest = sim.leaders.slice(3, 10);
  const name = t(`sims.${sim.simId}.name`);
  return (
    <article aria-labelledby={`eg-showcase-${sim.simId}`} className={`eg-shell-showcase__col eg-shell-showcase__col--${sim.simId}`}>
      <header className="eg-shell-showcase__colHead">
        <img alt="" className="eg-shell-showcase__logo" height={28} src={`/brand/sims/${sim.simId}-icon-white.png`} width={28} />
        <h3 className="eg-shell-showcase__simName" id={`eg-showcase-${sim.simId}`}>{name}</h3>
        <span className="eg-shell-showcase__tagline">{t(`sims.${sim.simId}.tagline`)}</span>
      </header>
      {sim.reward !== null && (
        <p className="eg-shell-showcase__reward">
          <icons.Trophy aria-hidden="true" className="eg-shell-showcase__rewardIcon" />
          <span>
            <span className="eg-shell-showcase__rewardLabel">
              {t("home.showcase.reward")} · {daysLeftInMonth(sim.reward.month, now)} {t("home.showcase.daysLeft")}
            </span>
            <span className="eg-shell-showcase__rewardTitle">{sim.reward.title}</span>
            <span className="eg-shell-showcase__rewardSponsor">{sim.reward.sponsor}</span>
          </span>
        </p>
      )}
      {sim.leaders.length === 0 ? (
        <div className="eg-shell-showcase__empty">
          <p>{t("home.showcase.empty")}</p>
          <a className="eg-shell-showcase__cta" href={simHref(sim.simId)}>
            {t("home.showcase.beFirst")}
            <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
          </a>
        </div>
      ) : (
        <>
          <Podium leaders={sim.leaders} />
          {rest.length > 0 && (
            <details className="eg-shell-showcase__more">
              <summary className="eg-shell-showcase__moreSummary">{t("home.showcase.top10")}</summary>
              <ol className="eg-shell-showcase__list" start={4}>
                {rest.map((leader) => (
                  <li className={leader.isMe ? "eg-shell-showcase__row eg-shell-showcase__row--me" : "eg-shell-showcase__row"} key={leader.rank}>
                    <span className="eg-shell-showcase__rowName">{leader.displayName}</span>
                    <span className="eg-shell-showcase__rowScore">{scoreText(leader.score)}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <a className="eg-shell-showcase__cta" href={simHref(sim.simId)}>
            {t("home.showcase.join")}
            <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
          </a>
        </>
      )}
    </article>
  );
}

export interface ShowcaseSectionProps {
  readonly source: ShowcaseSource | null;
  /** Geçerli ay ('YYYY-MM'); başlıkta ay adı olarak görünür. */
  readonly month: string;
  readonly previousMonth: string;
}

export function ShowcaseSection({ source, month, previousMonth }: ShowcaseSectionProps): JSX.Element | null {
  const [sims, setSims] = useState<readonly ShowcaseSim[] | null>(null);
  useEffect(() => {
    if (source === null) return undefined;
    let alive = true;
    const refresh = () => {
      source.getShowcase().then(
        (next) => { if (alive) setSims(next); },
        () => { if (alive) setSims([]); },
      );
    };
    refresh();
    const unsubscribe = source.subscribe?.(refresh);
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [source]);
  if (source === null || sims === null || sims.length === 0) return null;
  const now = shellNow();
  const winners = sims.filter((sim) => sim.lastMonthWinners.length > 0);
  return (
    <section aria-labelledby="eg-home-showcase" className="eg-shell-showcase">
      <div className="eg-shell-showcase__intro">
        <p className="eg-shell-showcase__eyebrow">
          <icons.Trophy aria-hidden="true" className="eg-shell-showcase__eyebrowIcon" />
          {t("home.showcase.eyebrow")}
        </p>
        <h2 className="eg-shell-showcase__title" id="eg-home-showcase">
          {t("home.showcase.title")} · {monthLabelTr(month)}
        </h2>
        <p className="eg-shell-showcase__lead">{t("home.showcase.lead")}</p>
      </div>
      <div className="eg-shell-showcase__grid">
        {sims.map((sim) => (
          <SimColumn key={sim.simId} now={now} sim={sim} />
        ))}
      </div>
      {winners.length > 0 && (
        <div className="eg-shell-hall">
          <h3 className="eg-shell-hall__title">
            {t("home.showcase.hall")} · {monthLabelTr(previousMonth)}
          </h3>
          <ul className="eg-shell-hall__grid">
            {winners.map((sim) => (
              <li className="eg-shell-hall__card" key={sim.simId}>
                <p className="eg-shell-hall__sim">{t(`sims.${sim.simId}.name`)}</p>
                <ol className="eg-shell-hall__list">
                  {sim.lastMonthWinners.map((winner) => (
                    <li className={`eg-shell-hall__winner eg-shell-hall__winner--${winner.rank}`} key={winner.rank}>
                      <span aria-hidden="true" className="eg-shell-hall__medal">{winner.rank}</span>
                      <span className="eg-shell-hall__name">{winner.displayName}</span>
                      <span className="eg-shell-hall__score">{scoreText(winner.score)}</span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
