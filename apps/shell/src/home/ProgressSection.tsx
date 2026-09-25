import { useEffect, useState, type JSX } from "react";
import { Badge, Tabs, type TabItem } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";
import { useShellDataSources, type LeaderboardPreferencesSource } from "../dataSources";
import type { ShellSession } from "../session";
import { formatTrDate } from "../admin/trFormat";
import { simHref } from "../routes";
import { SIM_IDS, type SimId } from "../SimCard";
import {
  createSyntheticGamificationSource,
  summaryForSim,
  type GamificationSource,
  type GamiSimSummary,
} from "./gamificationSource";
import { badgeCatalogSize, catalogBadge } from "./badgeCatalog";

export type ProgressLoadStatus = "loading" | "ready" | "error";

/**
 * API oturumunun rozet listesi (T114, ADR-008 S4): sunucu anahtarları katalog
 * tanımıyla ad/kısa açıklama/kazanılma tarihi olarak gösterilir; katalogda
 * olmayan anahtar sessizce atlanır. Sayaç yalnız kendi siminin katalog
 * uzunluğunu kullanır — simler arası toplam yoktur (ADR-006).
 */
function ServerBadgeList({
  simId,
  badges,
}: {
  readonly simId: SimId;
  readonly badges: GamiSimSummary["badges"];
}): JSX.Element {
  const matched = badges.flatMap((badge) => {
    const def = catalogBadge(simId, badge.key);
    return def === undefined ? [] : [{ def, awardedAt: badge.awardedAt }];
  });
  if (matched.length === 0) {
    return <p>{t("home.progress.badges.empty")}</p>;
  }
  return (
    <>
      <p className="eg-shell-progress__badgeCount">
        {matched.length}/{badgeCatalogSize(simId)} {t("home.progress.badges.unit")}
      </p>
      <ul className="eg-shell-progress__badgeList">
        {matched.map(({ def, awardedAt }) => (
          <li className="eg-shell-progress__badgeCard" key={def.id}>
            <p className="eg-shell-progress__badgeName">{def.name}</p>
            <p className="eg-shell-progress__badgeDesc">{def.description}</p>
            <p className="eg-shell-progress__badgeDate">
              {t("home.progress.badges.awarded")} {formatTrDate(awardedAt)}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Tek sim sekmesinin içeriği (E3 §e.8): kayıt yoksa boş durum + sim
 * bağlantısı; kayıt varsa XP/seviye/seri/haftalık hedef/liderlik özet
 * kutuları (framework `results-summary-strip` deseni) ve son rozetler.
 * Simler arası toplam YOKTUR — her panel yalnız kendi `summary`sini okur.
 * API oturumunda (`badgeCatalog`) rozetler katalog adlarıyla gösterilir (T114);
 * sahte oturumda mevcut ham anahtar davranışı korunur.
 */
function SimProgressPanel({
  simId,
  summary,
  badgeCatalog = false,
}: {
  readonly simId: SimId;
  readonly summary: GamiSimSummary | undefined;
  readonly badgeCatalog?: boolean;
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
        {badgeCatalog ? (
          <ServerBadgeList simId={simId} badges={summary.badges} />
        ) : summary.badges.length === 0 ? (
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

export interface LeaderboardVisibilityView {
  readonly visible: boolean;
  readonly pending: boolean;
  readonly error: boolean;
  readonly onToggle: (visible: boolean) => void;
}

/** Kaydetme başarısızsa önceki görünürlük geri gelir. */
export async function commitLeaderboardVisibility(
  previous: boolean,
  next: boolean,
  save: (visible: boolean) => Promise<boolean>,
): Promise<{ readonly visible: boolean; readonly failed: boolean }> {
  try {
    const visible = await save(next);
    return { failed: false, visible };
  } catch {
    return { failed: true, visible: previous };
  }
}

export function LeaderboardVisibilityControl({
  error,
  onToggle,
  pending,
  visible,
}: LeaderboardVisibilityView): JSX.Element {
  return (
    <div className="eg-shell-progress__optout">
      <label className="eg-shell-progress__optoutLabel">
        <input
          aria-checked={visible}
          aria-describedby="eg-leaderboard-visible-hint"
          checked={visible}
          disabled={pending}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          role="switch"
          type="checkbox"
        />
        {t("home.progress.leaderboardVisible")}
      </label>
      <p className="eg-shell-progress__optoutHint" id="eg-leaderboard-visible-hint">
        {t("home.progress.leaderboardVisible.hint")}
      </p>
      {error ? (
        <p className="eg-shell-progress__optoutError" role="alert">
          {t("home.progress.leaderboardVisible.error")}
        </p>
      ) : null}
    </div>
  );
}

export interface ProgressSectionViewProps {
  readonly status: ProgressLoadStatus;
  readonly summaries: readonly GamiSimSummary[];
  readonly onRetry: () => void;
  readonly leaderboard?: LeaderboardVisibilityView | null;
  /** API oturumunda rozet anahtarları katalog adlarıyla gösterilir (T114). */
  readonly badgeCatalog?: boolean;
}

/**
 * Oturumun API oturumu mu kararı (T114): `simAccess` yalnız API oturumunda
 * doludur, sahte oturumda `null` kalır (bkz. `session.ts`); API oturumunda
 * rozetler katalog adlarıyla gösterilir, sahte oturum ham anahtarı korur.
 */
export function usesBadgeCatalog(session: ShellSession | null): boolean {
  return session !== null && session.simAccess !== null;
}

/**
 * "İlerlemem" bölümünün durumsuz (props'tan beslenen) görünümü. `ProgressSection`
 * veri getirmeyi sarar; bu bileşen DOM'suz testlerde doğrudan render edilir
 * (SSR efekt çalıştırmaz, bu yüzden durum burada açıkça props'tan gelir —
 * `UsersListView` deseni).
 */
export function ProgressSectionView({
  badgeCatalog = false,
  leaderboard = null,
  onRetry,
  status,
  summaries,
}: ProgressSectionViewProps): JSX.Element {
  const tabs: readonly TabItem[] = SIM_IDS.map((id) => ({
    id,
    label: t(`sims.${id}.name`),
    panel: (
      <SimProgressPanel badgeCatalog={badgeCatalog} simId={id} summary={summaryForSim(summaries, id)} />
    ),
  }));
  return (
    <section aria-labelledby="eg-home-progress" className="eg-shell-home__section">
      <h2 className="eg-shell-section__title" id="eg-home-progress">
        {t("home.progress.title")}
      </h2>
      {leaderboard !== null && <LeaderboardVisibilityControl {...leaderboard} />}
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
  /** Geçerli oturum (sahte ya da API); `null`/verilmezse veri kaynağı boş durum döner. */
  readonly session?: ShellSession | null;
  /** Testte/gelecekte gerçek API kaynağıyla değiştirmek için enjekte edilir. */
  readonly dataSource?: GamificationSource;
  /** API oturumunda liderlik anahtarı. Sahte oturumda verilmez. */
  readonly preferences?: LeaderboardPreferencesSource | null;
}

function defaultSource(session: ShellSession | null): GamificationSource {
  return createSyntheticGamificationSource(session !== null);
}

/**
 * Ana sayfa "İlerlemem" kabı (T74, E3 §e.8). Veri `GamificationSource`
 * üzerinden enjekte edilir; sayfa yalnız istek yaşam döngüsünü
 * (yükleniyor/hazır/hata) yönetir, çizim `ProgressSectionView`'dedir.
 */
export function ProgressSection({
  dataSource,
  preferences,
  session = null,
}: ProgressSectionProps): JSX.Element {
  const sources = useShellDataSources();
  const actorId = session?.actorId ?? "";
  const [status, setStatus] = useState<ProgressLoadStatus>("loading");
  const [summaries, setSummaries] = useState<readonly GamiSimSummary[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardVisibilityView | null>(null);

  useEffect(() => {
    const activeSession = actorId.length > 0 ? session : null;
    const source = dataSource ?? sources?.gamification(activeSession) ?? defaultSource(activeSession);
    let active = true;
    setStatus("loading");
    source.getSummaries().then(
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
  }, [actorId, attempt, dataSource, sources]);

  const preferenceSource =
    preferences ?? sources?.leaderboardPreferences(actorId.length > 0 ? session : null) ?? null;

  useEffect(() => {
    if (preferenceSource === null || session?.simAccess === null) {
      setLeaderboard(null);
      return undefined;
    }
    let active = true;
    preferenceSource.getVisible().then(
      (visible) => {
        if (!active) return;
        setLeaderboard({
          error: false,
          onToggle: (next) => {
            let previous = visible;
            setLeaderboard((current) => {
              if (current === null || current.pending) return current;
              previous = current.visible;
              return { ...current, error: false, pending: true, visible: next };
            });
            void commitLeaderboardVisibility(previous, next, (value) => preferenceSource.setVisible(value)).then(
              (result) => {
                if (!active) return;
                setLeaderboard((current) =>
                  current === null
                    ? current
                    : { ...current, error: result.failed, pending: false, visible: result.visible },
                );
              },
            );
          },
          pending: false,
          visible,
        });
      },
      () => {
        if (active) setLeaderboard(null);
      },
    );
    return () => {
      active = false;
    };
  }, [preferenceSource, session]);

  return (
    <ProgressSectionView
      badgeCatalog={usesBadgeCatalog(session)}
      leaderboard={leaderboard}
      onRetry={() => setAttempt((value) => value + 1)}
      status={status}
      summaries={summaries}
    />
  );
}
