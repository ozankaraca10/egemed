import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Button, EmptyState, icons, useToast } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import type { ChallengeBody } from "@egemed/contracts";
import type { SimulatorId } from "@egemed/sim-host";
import { useShellDataSources } from "../dataSources";
import { challengeHref, challengePlayHref, routeHref, simScreenHref } from "../routes";
import type { ShellSession } from "../session";
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

export interface ChallengeDetailPageProps {
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
      <section className="eg-shell-page eg-shell-duel">
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
      <section className="eg-shell-page eg-shell-duel" aria-busy="true">
        {back}
      </section>
    );
  }

  const me = challenge.participants.find((participant) => participant.isMe);
  const outcome = outcomeFor(challenge);
  const canPlay =
    me !== undefined && !me.finished && (challenge.status === "accepted" || (challenge.status === "open" && me.role === "inviter"));

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

  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <section className="eg-shell-page eg-shell-duel">
      {back}
      <header className="eg-shell-duel__detailHead">
        <Heading className="eg-shell-page__title">
          {t("challenges.detail.title")} · {t(`sims.${challenge.simId}.name`)}
        </Heading>
        <ChallengeStatusBadge challenge={challenge} />
      </header>
      {challenge.winner !== null ? (
        <p className={`eg-shell-duel__banner eg-shell-duel__banner--${outcome}`} role="status">
          <icons.Trophy aria-hidden="true" className="eg-shell-duel__bannerIcon" />
          {t(BANNER[outcome])}
        </p>
      ) : me?.finished === true ? (
        <p className="eg-shell-duel__waiting" role="status">
          {t("challenges.detail.waiting")}
        </p>
      ) : null}
      {challenge.code !== null ? (
        <div className="eg-shell-duel__code">
          <p className="eg-shell-duel__codeLabel">{t("challenges.code.label")}</p>
          <p className="eg-shell-duel__codeValue">{challenge.code}</p>
          <p className="eg-shell-duel__codeNote">{t("challenges.code.expires")}</p>
        </div>
      ) : null}
      <ul className="eg-shell-duel__versus">
        {challenge.participants.map((participant) => (
          <li
            className={[
              "eg-shell-duel__side",
              participant.isMe ? "eg-shell-duel__side--me" : "",
              challenge.winner === participant.role ? "eg-shell-duel__side--winner" : "",
            ].join(" ")}
            key={participant.role}
          >
            <p className="eg-shell-duel__sideRole">
              {t(participant.role === "inviter" ? "challenges.inviter" : "challenges.opponent")}
              {participant.isMe ? ` · ${t("challenges.you")}` : ""}
            </p>
            <p className="eg-shell-duel__sideName">{participant.displayName}</p>
            <p className="eg-shell-duel__sideState">{t(participant.finished ? "challenges.detail.played" : "challenges.detail.notPlayed")}</p>
            <dl className="eg-shell-duel__stats">
              <div>
                <dt>{t("challenges.detail.score")}</dt>
                <dd>{participant.score === null ? "—" : Math.round(participant.score)}</dd>
              </div>
              <div>
                <dt>{t("challenges.detail.duration")}</dt>
                <dd>{formatDuration(participant.durationMs)}</dd>
              </div>
            </dl>
          </li>
        ))}
        {challenge.participants.length < 2 ? (
          <li className="eg-shell-duel__side eg-shell-duel__side--empty">
            <p className="eg-shell-duel__sideRole">{t("challenges.opponent")}</p>
            <p className="eg-shell-duel__sideName">{t("challenges.opponent.none")}</p>
          </li>
        ) : null}
      </ul>
      <div className="eg-shell-duel__actions">
        {canPlay ? (
          <Button iconEnd={<icons.ArrowRight />} onClick={() => navigate(challengePlayHref(challenge.simId, challenge.challengeId))}>
            {t("challenges.play")}
          </Button>
        ) : null}
        {challenge.winner !== null ? (
          <Button loading={rematching} onClick={() => void rematch()} variant="secondary">
            {t("challenges.detail.rematch")}
          </Button>
        ) : null}
        <Button onClick={refresh} variant="ghost">
          {t("challenges.detail.refresh")}
        </Button>
      </div>
    </section>
  );
}
