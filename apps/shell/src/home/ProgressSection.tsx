import { useEffect, useState, type JSX } from "react";
import { DEFAULT_RULES, type WeeklyGoal } from "@egemed/gamification-core";
import {
  defaultGamiIcons,
  GamiProfileStrip,
  GamiRecentBadges,
  GamiWeeklyGoals,
  levelFromServer,
  type GamiAvatarOf,
  type GamiBadgeModel,
} from "@egemed/gami-ui";
import { Tabs, type TabItem } from "@egemed/ui";
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
import { catalogBadge } from "./badgeCatalog";

export type ProgressLoadStatus = "loading" | "ready" | "error";

const AVATAR_OF: GamiAvatarOf = () => ({ text: "S", tone: "t-blue" });

function openSim(simId: SimId): void {
  if (typeof location === "undefined") return;
  location.hash = simHref(simId);
}

/** Katalog adı ve açıklaması. Katalogda olmayan anahtar (API ve sahte oturum) atlanır. */
function recentBadges(simId: SimId, summary: GamiSimSummary): GamiBadgeModel[] {
  const views: GamiBadgeModel[] = [];
  for (const badge of summary.badges) {
    const def = catalogBadge(simId, badge.key);
    if (def === undefined) continue;
    views.push({
      assessmentOnly: false,
      category: def.category,
      categoryLabel: "Rozet",
      description: def.description,
      earnedLabel: `${t("home.progress.badges.awarded")} ${formatTrDate(badge.awardedAt)}`,
      iconName: "Star",
      id: def.id,
      lockedNote: null,
      max: 1,
      name: def.name,
      rule: "",
      state: "earned",
      studyKey: null,
      tier: null,
      tierLabel: null,
      value: 1,
    });
  }
  return views;
}

function weeklyXpGoal(summary: GamiSimSummary): WeeklyGoal {
  const target = summary.weeklyGoal.targetXp;
  const current = summary.weeklyGoal.currentXp;
  const max = target > 0 ? target : 1;
  return {
    done: target > 0 && current >= target,
    id: "weekly-assessments",
    label: t("home.progress.weeklyGoal"),
    max,
    value: target > 0 ? Math.min(current, target) : 0,
  };
}

function SimOpenLink({ simId }: { readonly simId: SimId }): JSX.Element {
  return (
    <a className="eg-shell-progress__tabEmptyLink" href={simHref(simId)}>
      {t("home.progress.openInSim")}
    </a>
  );
}

/**
 * Tek sim sekmesi (ADR-006): yalnız bu simin özeti. Kayıt varsa ortak
 * gami-ui şeridi, haftalık hedef ve son rozetler; yoksa boş durum.
 * Rozet adı katalogdan gelir; katalogda olmayan anahtar gösterilmez.
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
        <SimOpenLink simId={simId} />
      </div>
    );
  }
  const level = levelFromServer(summary.xp, summary.level, DEFAULT_RULES);
  const scored = summary.attempts.filter(
    (attempt) => attempt.score !== null && attempt.maxScore !== null && attempt.maxScore > 0,
  );
  const periodAvg =
    scored.length === 0
      ? null
      : scored.reduce((sum, attempt) => sum + ((attempt.score ?? 0) / (attempt.maxScore ?? 1)) * 100, 0) / scored.length;
  return (
    <div className="eg-shell-progress__panel eg-gami-page eg-gami-dash" data-sim-id={simId} data-xp={summary.xp}>
      <GamiProfileStrip
        avatarOf={AVATAR_OF}
        icons={{
          check: defaultGamiIcons.checkCircle({ height: 16, width: 16 }),
          chevron: defaultGamiIcons.chevronRight({ height: 14, width: 14 }),
          flame: defaultGamiIcons.flame({ height: 20, width: 20 }),
        }}
        onLeaderboard={() => openSim(simId)}
        profile={{
          avatarId: "me",
          avatarName: null,
          level: level.level,
          periodAssessments: summary.attempts.length,
          periodAvg,
          periodLabel: "kayıtlar",
          periodPractice: 0,
          streakCurrent: summary.streak.current,
          streakLongest: summary.streak.best,
          weekRank: summary.leaderboard.rank,
          weekRanked: summary.leaderboard.total,
          xpInto: level.xpIntoLevel,
          xpSpan: level.levelEndXp - level.levelStartXp,
          xpToNext: level.xpToNext,
        }}
      />
      <section aria-labelledby={`eg-progress-goals-${simId}`}>
        <h3 id={`eg-progress-goals-${simId}`}>{t("home.progress.weeklyGoal")}</h3>
        <GamiWeeklyGoals
          doneIcon={defaultGamiIcons.check({ height: 16, width: 16 })}
          goals={[weeklyXpGoal(summary)]}
          iconFor={() => defaultGamiIcons.target({ height: 16, width: 16 })}
        />
      </section>
      <section aria-labelledby={`eg-progress-badges-${simId}`}>
        <h3 id={`eg-progress-badges-${simId}`}>{t("home.progress.badges")}</h3>
        <GamiRecentBadges
          emptyNote={t("home.progress.badges.empty")}
          icons={defaultGamiIcons}
          onAll={() => openSim(simId)}
          onStudy={() => openSim(simId)}
          views={recentBadges(simId, summary)}
        />
      </section>
      <SimOpenLink simId={simId} />
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
  /** Çağıranlar geçebilir; rozet adı her durumda katalogdan gelir (katalog dışı anahtar atlanır). */
  readonly badgeCatalog?: boolean;
}

/**
 * Oturumun API oturumu mu kararı (T114): `simAccess` yalnız API oturumunda
 * doludur, sahte oturumda `null` kalır (bkz. `session.ts`). Rozet adı her iki
 * oturumda katalogdan gelir; katalogda olmayan anahtar atlanır.
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
  leaderboard = null,
  onRetry,
  status,
  summaries,
}: ProgressSectionViewProps): JSX.Element {
  const tabs: readonly TabItem[] = SIM_IDS.map((id) => ({
    id,
    label: t(`sims.${id}.name`),
    panel: (
      <SimProgressPanel simId={id} summary={summaryForSim(summaries, id)} />
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
