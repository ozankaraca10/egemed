import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { EmptyState, icons, useToast } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import type { ChallengeBody } from "@egemed/contracts";
import type { SimulatorId } from "@egemed/sim-host";
import { useShellDataSources } from "../dataSources";
import { challengeHref, challengePlayHref, routeHref, simScreenHref } from "../routes";
import type { ShellSession } from "../session";
import { ArenaEyebrow, CodeTiles, DuelRules, DuelStage, FairPlayNotice, Versus } from "./arena/ArenaParts";
import { ChallengeStatusBadge } from "./ChallengesPage";
import { challengeErrorKey, formatDuration, outcomeFor } from "./challengeSource";

/**
 * Düello ayrıntısı (ADR-010; T281a): sim içi merkezde açılır. İki taraf, durum,
 * puanlar (iki taraf bitirince), kazanan, "Şimdi oyna" ve rövanş. Beklerken
 * 15 sn'de bir yenilenir. Eski adres (`#/meydan-okuma/<uuid>`) kaynaktan simi
 * çözünce sim içi ayrıntıya `replace` ile yönlendirir.
 */

const REFRESH_MS = 15_000;

function navigate(href: `#${string}`): void {
  const scope = globalThis as { location?: { hash: string } };
  if (scope.location !== undefined) scope.location.hash = href;
}

/** Geçmişe girdi eklemeden yönlendirir (eski adres yönlendirmesi). */
function replaceHash(href: `#${string}`): void {
  const scope = globalThis as { location?: { replace(url: string): void } };
  scope.location?.replace(href);
}

const BANNER: Record<ReturnType<typeof outcomeFor>, TrKey> = {
  win: "challenges.result.win",
  lose: "challenges.result.lose",
  draw: "challenges.result.draw",
  pending: "challenges.result.pending",
};

interface ChallengeDetailPageProps {
  readonly challengeId: string;
  readonly session?: ShellSession | null;
  /** Sim içi ayrıntıda düellonun simi; verilmezse eski adres çözümü yapılır. */
  readonly simId?: SimulatorId;
  /** Sim içi yerleşimde birleşik bar h1 taşır; sayfa başlığı h2'ye iner. */
  readonly headingLevel?: 1 | 2;
}

export function ChallengeDetailPage({ challengeId, session = null, simId, headingLevel = 1 }: ChallengeDetailPageProps): JSX.Element {
  const sources = useShellDataSources();
  const source = useMemo(() => (sources === null ? null : sources.challenges(session)), [sources, session]);
  const toast = useToast();
  const [challenge, setChallenge] = useState<ChallengeBody | null>(null);
  const [missing, setMissing] = useState(false);
  const [rematching, setRematching] = useState(false);

  const refresh = useCallback(() => {
    if (source === null) return;
    void source
      .get(challengeId)
      .then((next) => {
        setChallenge(next);
        setMissing(false);
      })
      .catch(() => setMissing(true));
  }, [challengeId, source]);

  useEffect(() => refresh(), [refresh]);
  useEffect(() => {
    if (challenge === null || challenge.winner !== null || challenge.status === "expired") return undefined;
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [challenge, refresh]);
  useEffect(() => {
    // T281a: eski adres simi bilmiyor; kaynaktan çözülünce sim içi ayrıntıya geçilir.
    if (simId !== undefined || challenge === null) return;
    replaceHash(challengeHref(challenge.simId, challenge.challengeId));
  }, [challenge, simId]);

  const back = (
    <a
      className="eg-shell-duel__back"
      href={simId === undefined ? routeHref("simulators") : simScreenHref(simId, "meydan-okuma")}
    >
      <icons.ChevronLeft aria-hidden="true" className="eg-shell-cta__icon" />
      {t(simId === undefined ? "sims.back" : "challenges.detail.back")}
    </a>
  );

  if (source === null || missing) {
    return (
      <section className="eg-shell-page eg-shell-arena">
        {back}
        <EmptyState
          description={t(source === null ? "challenges.unavailable.body" : "challenges.error.notFound")}
          icon={<icons.Users />}
          title={t(source === null ? "challenges.unavailable.title" : "challenges.detail.title")}
        />
      </section>
    );
  }
  if (challenge === null) {
    return (
      <section className="eg-shell-page eg-shell-arena" aria-busy="true">
        {back}
      </section>
    );
  }

  const me = challenge.participants.find((participant) => participant.isMe);
  const rival = challenge.participants.find((participant) => !participant.isMe);
  const outcome = outcomeFor(challenge);
  const canPlay =
    me !== undefined && !me.finished && (challenge.status === "accepted" || (challenge.status === "open" && me.role === "inviter"));
  const rivalName = rival?.displayName ?? t("challenges.opponent");
  const named = (key: TrKey) => t(key).replace("{name}", rivalName);

  const rematch = async () => {
    setRematching(true);
    try {
      const next = await source.create(challenge.simId);
      navigate(challengeHref(next.simId, next.challengeId));
    } catch (error) {
      toast({ title: t(challengeErrorKey(error)), tone: "error" });
    } finally {
      setRematching(false);
    }
  };

  const playButton = canPlay ? (
    <button
      className="eg-shell-arena__cta eg-shell-arena__cta--gold"
      onClick={() => navigate(challengePlayHref(challenge.simId, challenge.challengeId))}
      type="button"
    >
      {t("challenges.match.start")}
      <icons.ArrowRight aria-hidden="true" className="eg-shell-arena__ctaIcon" />
    </button>
  ) : null;
  const refreshButton = (
    <button className="eg-shell-arena__cta eg-shell-arena__cta--ghost" onClick={refresh} type="button">
      {t("challenges.detail.refresh")}
    </button>
  );

  let stage: JSX.Element;
  if (challenge.status === "expired" && challenge.winner === null) {
    stage = (
      <div className="eg-shell-arena__center">
        <ArenaEyebrow>{t("challenges.status.expired")}</ArenaEyebrow>
        <p className="eg-shell-arena__title">{t("challenges.expired.title")}</p>
        <div className="eg-shell-arena__actions">
          <a className="eg-shell-arena__cta eg-shell-arena__cta--ghost" href={simScreenHref(challenge.simId, "meydan-okuma")}>
            {t("challenges.result.back")}
          </a>
        </div>
      </div>
    );
  } else if (challenge.winner !== null) {
    const winnerSide = challenge.winner === "draw" ? null : challenge.winner === me?.role ? "me" : "rival";
    const scoreMe = me?.score ?? 0;
    const scoreRival = rival?.score ?? 0;
    const scoreMax = Math.max(1, scoreMe, scoreRival);
    const timeMe = me?.durationMs ?? 0;
    const timeRival = rival?.durationMs ?? 0;
    const timeMax = Math.max(1, timeMe, timeRival);
    stage = (
      <div className="eg-shell-arena__center">
        <p className={`eg-shell-arena__banner eg-shell-arena__banner--${outcome}`} role="status">{t(BANNER[outcome])}</p>
        <p className="eg-shell-arena__title">
          {named(outcome === "win" ? "challenges.result.titleWin" : outcome === "lose" ? "challenges.result.titleLose" : "challenges.result.titleDraw")}
        </p>
        <Versus
          me={{ side: "me", name: me?.displayName ?? null, crowned: winnerSide === "me" }}
          rival={{ side: "rival", name: rival?.displayName ?? null, crowned: winnerSide === "rival" }}
        />
        <div className="eg-shell-arena__board">
          {[
            { key: "score", label: t("challenges.result.score"), me: scoreMe, rival: scoreRival, max: scoreMax, text: (v: number) => String(Math.round(v)) },
            { key: "time", label: t("challenges.result.time"), me: timeMe, rival: timeRival, max: timeMax, text: (v: number) => formatDuration(v) },
          ].map((row) => (
            <div key={row.key}>
              <p className="eg-shell-arena__boardLbl">{row.label}</p>
              <div className="eg-shell-arena__boardRow">
                <span className="eg-shell-arena__boardVal eg-shell-arena__boardVal--me">{row.text(row.me)}</span>
                <span aria-hidden="true" className="eg-shell-arena__bars">
                  <i className="eg-shell-arena__barMe" style={{ width: `${Math.round((row.me / row.max) * 100)}%` }} />
                  <i className="eg-shell-arena__barRival" style={{ width: `${Math.round((row.rival / row.max) * 100)}%` }} />
                </span>
                <span className="eg-shell-arena__boardVal">{row.text(row.rival)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="eg-shell-arena__actions">
          <button className="eg-shell-arena__cta eg-shell-arena__cta--gold" disabled={rematching} onClick={() => void rematch()} type="button">
            <icons.Medal aria-hidden="true" className="eg-shell-arena__ctaIcon" />
            {t("challenges.result.rematch")}
          </button>
          <a className="eg-shell-arena__cta eg-shell-arena__cta--ghost" href={simScreenHref(challenge.simId, "meydan-okuma")}>
            {t("challenges.result.back")}
          </a>
        </div>
      </div>
    );
  } else if (rival === undefined) {
    stage = (
      <div className="eg-shell-arena__center">
        <ArenaEyebrow>{t("challenges.lobby.eyebrow")}</ArenaEyebrow>
        <p className="eg-shell-arena__title">{t("challenges.lobby.title")}</p>
        <p className="eg-shell-arena__lead">{t("challenges.lobby.lead")}</p>
        <Versus
          me={{ side: "me", name: me?.displayName ?? null, state: t(me?.finished === true ? "challenges.match.finishedHidden" : "challenges.lobby.ready") }}
          rival={{ side: "rival", name: null, waiting: true, state: t("challenges.lobby.rivalHint") }}
        />
        {challenge.code !== null ? (
          <>
            <CodeTiles code={challenge.code} />
            <p className="eg-shell-arena__lock">{t("challenges.code.expires")}</p>
          </>
        ) : null}
        <div className="eg-shell-arena__actions">
          {playButton}
          {refreshButton}
        </div>
      </div>
    );
  } else {
    const title = me?.finished === true ? t("challenges.match.titleMeDone") : rival.finished ? named("challenges.match.titleRivalDone") : t("challenges.match.titleReady");
    stage = (
      <div className="eg-shell-arena__center">
        <ArenaEyebrow>{t("challenges.match.eyebrow")}</ArenaEyebrow>
        <p className="eg-shell-arena__title">{title}</p>
        <p className="eg-shell-arena__lead">{t("challenges.match.lead")}</p>
        <Versus
          me={{ side: "me", name: me?.displayName ?? null, state: t(me?.finished === true ? "challenges.match.finishedHidden" : "challenges.match.notStarted") }}
          rival={{ side: "rival", name: rival.displayName, state: t(rival.finished ? "challenges.match.finishedHidden" : "challenges.match.playing") }}
        />
        <DuelRules caseCount={challenge.caseCount} perCaseLimitMs={challenge.perCaseLimitMs} totalLimitMs={challenge.totalLimitMs} />
        {me?.finished === true ? <p className="eg-shell-arena__lock" role="status">{t("challenges.detail.waiting")}</p> : null}
        <div className="eg-shell-arena__actions">
          {playButton}
          {refreshButton}
        </div>
      </div>
    );
  }

  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <section className="eg-shell-page eg-shell-arena">
      {back}
      <header className="eg-shell-duel__detailHead">
        <Heading className="eg-shell-page__title">
          {t("challenges.detail.title")} · {t(`sims.${challenge.simId}.name`)}
        </Heading>
        <ChallengeStatusBadge challenge={challenge} />
      </header>
      <DuelStage label={t("challenges.detail.title")}>{stage}</DuelStage>
      <FairPlayNotice />
    </section>
  );
}
