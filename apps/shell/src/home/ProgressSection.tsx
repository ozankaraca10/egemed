import { useEffect, useRef, useState, type JSX } from "react";
import { Badge, Tabs, type TabItem } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";
import type { DevSession } from "../devAuth";
import { simHref } from "../routes";
import { SIM_IDS, type SimId } from "../SimCard";
import {
  createSyntheticGamificationSource,
  summaryForSim,
  type GamificationSource,
  type GamiSimSummary,
} from "./gamificationSource";

export type ProgressLoadStatus = "loading" | "ready" | "error";

/**
 * Tek sim sekmesinin içeriği (E3 §e.8): kayıt yoksa boş durum + sim
 * bağlantısı; kayıt varsa XP/seviye/seri/haftalık hedef/liderlik özet
 * kutuları (framework `results-summary-strip` deseni) ve son rozetler.
 * Simler arası toplam YOKTUR — her panel yalnız kendi `summary`sini okur.
 */
function SimProgressPanel({
  simId,
  summary,
}: {
  readonly simId: SimId;
  readonly summary: GamiSimSummary | undefined;
}): JSX.Element {
  if (summary === undefined) {
    return (
      <div className="eg-shell-progress__tabEmpty">
        <p>{t("home.progress.tab.empty")}</p>
        <a className="eg-shell-progress__tabEmptyLink" href={simHref(simId)}>
          {t("sims.open")}
        </a>
      </div>
    );
  }
  return (
    <div className="eg-shell-progress__panel">
      <div className="eg-shell-progress__boxes">
        <div className="eg-shell-progress__box">
          <p className="eg-shell-progress__num">{summary.xp}</p>
          <p className="eg-shell-progress__lbl">{t("home.progress.xp")}</p>
        </div>
        <div className="eg-shell-progress__box">
          <p className="eg-shell-progress__num">{summary.level}</p>
          <p className="eg-shell-progress__lbl">{t("home.progress.level")}</p>
        </div>
        <div className="eg-shell-progress__box">
          <p className="eg-shell-progress__num">{summary.streak.current}</p>
          <p className="eg-shell-progress__sub">
            {t("home.progress.streak.best")} {summary.streak.best}
          </p>
          <p className="eg-shell-progress__lbl">{t("home.progress.streak")}</p>
        </div>
        <div className="eg-shell-progress__box">
          <p className="eg-shell-progress__num">
            {summary.weeklyGoal.currentXp}/{summary.weeklyGoal.targetXp}
          </p>
          <p className="eg-shell-progress__lbl">{t("home.progress.weeklyGoal")}</p>
        </div>
        <div className="eg-shell-progress__box">
          <p className="eg-shell-progress__num">
            {summary.leaderboard.rank}/{summary.leaderboard.total}
          </p>
          <p className="eg-shell-progress__lbl">{t("home.progress.leaderboard")}</p>
        </div>
      </div>
      <div className="eg-shell-progress__badges">
        <p className="eg-shell-progress__badgesTitle">{t("home.progress.badges")}</p>
        {summary.badges.length === 0 ? (
          <p>{t("home.progress.badges.empty")}</p>
        ) : (
          <ul className="eg-shell-progress__badgeList">
            {summary.badges.map((badge) => (
              <li key={badge.key}>
                <Badge tone="info">{badge.key}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export interface ProgressSectionViewProps {
  readonly status: ProgressLoadStatus;
  readonly summaries: readonly GamiSimSummary[];
  readonly onRetry: () => void;
}

/**
 * "İlerlemem" bölümünün durumsuz (props'tan beslenen) görünümü. `ProgressSection`
 * veri getirmeyi sarar; bu bileşen DOM'suz testlerde doğrudan render edilir
 * (SSR efekt çalıştırmaz, bu yüzden durum burada açıkça props'tan gelir —
 * `UsersListView` deseni).
 */
export function ProgressSectionView({ status, summaries, onRetry }: ProgressSectionViewProps): JSX.Element {
  const tabs: readonly TabItem[] = SIM_IDS.map((id) => ({
    id,
    label: t(`sims.${id}.name`),
    panel: <SimProgressPanel simId={id} summary={summaryForSim(summaries, id)} />,
  }));
  return (
    <section aria-labelledby="eg-home-progress" className="eg-shell-home__section">
      <h2 className="eg-shell-section__title" id="eg-home-progress">
        {t("home.progress.title")}
      </h2>
      {status === "loading" && (
        <div aria-hidden="true" className="eg-shell-progress__skeleton">
          {SIM_IDS.map((id) => (
            <span className="eg-shell-progress__skeleton-row" key={id} />
          ))}
        </div>
      )}
      {status === "error" && (
        <div className="eg-shell-progress__error" role="alert">
          <p className="eg-shell-progress__error-title">{t("home.progress.error.title")}</p>
          <p>{t("home.progress.error.body")}</p>
          <button onClick={onRetry} type="button">
            {t("home.progress.error.retry")}
          </button>
        </div>
      )}
      {status === "ready" && <Tabs items={tabs} label={t("home.progress.title")} />}
    </section>
  );
}

export interface ProgressSectionProps {
  /** Geçerli sahte oturum; `null`/verilmezse veri kaynağı boş durum döner. */
  readonly session?: DevSession | null;
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: GamificationSource;
}

function defaultSource(session: DevSession | null): GamificationSource {
  return createSyntheticGamificationSource(session !== null);
}

/**
 * Ana sayfa "İlerlemem" kabı (T74, E3 §e.8). Veri `GamificationSource`
 * üzerinden enjekte edilir; sayfa yalnız istek yaşam döngüsünü
 * (yükleniyor/hazır/hata) yönetir, çizim `ProgressSectionView`'dedir.
 */
export function ProgressSection({ session = null, dataSource }: ProgressSectionProps): JSX.Element {
  const sourceRef = useRef<GamificationSource | null>(null);
  if (sourceRef.current === null) sourceRef.current = dataSource ?? defaultSource(session);

  const [status, setStatus] = useState<ProgressLoadStatus>("loading");
  const [summaries, setSummaries] = useState<readonly GamiSimSummary[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    sourceRef.current?.getSummaries().then(
      (next) => {
        if (!active) return;
        setSummaries(next);
        setStatus("ready");
      },
      () => {
        if (active) setStatus("error");
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <ProgressSectionView onRetry={() => setAttempt((value) => value + 1)} status={status} summaries={summaries} />
  );
}
