import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Button, EmptyState, Field, TextInput, icons, useToast } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import type { ChallengeBody, LearnStatus, SimId } from "@egemed/contracts";
import { useShellDataSources } from "../dataSources";
import { challengeHref, challengePlayHref, simScreenHref } from "../routes";
import { isFacultyLike, type ShellSession } from "../session";
import { challengeErrorKey, outcomeFor, type ChallengeSource } from "./challengeSource";

/**
 * Meydan Okuma sayfası (ADR-010; T281a): sim içi merkez. Oluşturma, kodla
 * katılma ve düellolarım; kullanıcı arama/liste yoktur (KVKK). Sayfa sabit bir
 * simle çizilir: sim seçici yoktur, liste yalnız o simin düellolarını gösterir.
 * Öğrenme kilidi (27 Eyl 2026): öğrenmesi tamamlanmamış simde oluşturma ve
 * katılma pasiftir; sunucu da aynı kuralı uygular (`learn_required`).
 */

/** Sim içi merkez: kaynak tüm düellolarımı verir; liste sabit sime daraltılır. */
export function challengesForSim(simId: SimId, list: readonly ChallengeBody[]): readonly ChallengeBody[] {
  return list.filter((challenge) => challenge.simId === simId);
}

function navigate(href: `#${string}`): void {
  const scope = globalThis as { location?: { hash: string } };
  if (scope.location !== undefined) scope.location.hash = href;
}

function copyText(text: string): Promise<void> {
  const clipboard = (globalThis as { navigator?: { clipboard?: { writeText(value: string): Promise<void> } } }).navigator?.clipboard;
  return clipboard === undefined ? Promise.reject(new Error("clipboard_unavailable")) : clipboard.writeText(text);
}

const STATUS_KEY: Record<ChallengeBody["status"], TrKey> = {
  open: "challenges.status.open",
  accepted: "challenges.status.accepted",
  finished: "challenges.status.finished",
  expired: "challenges.status.expired",
};

const OUTCOME_KEY: Record<ReturnType<typeof outcomeFor>, TrKey> = {
  win: "challenges.result.win",
  lose: "challenges.result.lose",
  draw: "challenges.result.draw",
  pending: "challenges.result.pending",
};

export function ChallengeStatusBadge({ challenge }: { readonly challenge: ChallengeBody }): JSX.Element {
  const outcome = outcomeFor(challenge);
  const tone = outcome === "win" ? "win" : outcome === "lose" ? "lose" : challenge.status;
  return (
    <span className={`eg-shell-duel__badge eg-shell-duel__badge--${tone}`}>
      {t(challenge.status === "finished" ? OUTCOME_KEY[outcome] : STATUS_KEY[challenge.status])}
    </span>
  );
}

function CodeCard({ challenge }: { readonly challenge: ChallengeBody }): JSX.Element | null {
  const toast = useToast();
  if (challenge.code === null) return null;
  return (
    <div className="eg-shell-duel__code" aria-live="polite">
      <p className="eg-shell-duel__codeLabel">{t("challenges.code.label")}</p>
      <p className="eg-shell-duel__codeValue" aria-label={`${t("challenges.code.label")}: ${challenge.code.split("").join(" ")}`}>
        {challenge.code}
      </p>
      <p className="eg-shell-duel__codeNote">{t("challenges.code.expires")}</p>
      <div className="eg-shell-duel__actions">
        <Button
          icon={<icons.ClipboardList />}
          onClick={() => {
            void copyText(challenge.code ?? "")
              .then(() => toast({ title: t("challenges.code.copied"), tone: "success" }))
              .catch(() => undefined);
          }}
          variant="secondary"
        >
          {t("challenges.code.copy")}
        </Button>
        <Button iconEnd={<icons.ArrowRight />} onClick={() => navigate(challengePlayHref(challenge.simId, challenge.challengeId))}>
          {t("challenges.play")}
        </Button>
      </div>
    </div>
  );
}

export function ChallengeWorkspace({
  source,
  learn = null,
  simId,
}: {
  readonly source: ChallengeSource;
  /** Öğrenme tamamlama durumu; null iken durum henüz okunmamıştır (kapı sunucuda). */
  readonly learn?: LearnStatus | null;
  /** Merkezin sabit simi; oluşturma bu sim için yapılır ve liste buna göre süzülür. */
  readonly simId: SimId;
}): JSX.Element {
  const toast = useToast();
  const [created, setCreated] = useState<ChallengeBody | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [list, setList] = useState<readonly ChallengeBody[] | null>(null);

  const refresh = useCallback(() => {
    void source
      .list()
      .then((items) => setList(challengesForSim(simId, items)))
      .catch(() => setList([]));
  }, [source, simId]);
  useEffect(() => refresh(), [refresh]);

  const create = async () => {
    setCreating(true);
    try {
      const challenge = await source.create(simId);
      setCreated(challenge);
      toast({ title: t("challenges.create.done"), tone: "success" });
      refresh();
    } catch (error) {
      toast({ title: t(challengeErrorKey(error)), tone: "error" });
    } finally {
      setCreating(false);
    }
  };

  const join = async () => {
    if (!/^[0-9]{6}$/.test(code)) {
      setCodeError(t("challenges.join.invalid"));
      return;
    }
    setCodeError(null);
    setJoining(true);
    try {
      const challenge = await source.join(code);
      navigate(challengeHref(challenge.simId, challenge.challengeId));
    } catch (error) {
      setCodeError(t(challengeErrorKey(error)));
    } finally {
      setJoining(false);
    }
  };

  // Öğrenme kilidi: sabit simin tamamlanma kaydı yoksa oluşturma ve katılma
  // pasiftir; durum henüz okunmadıysa (`null`) düğmeler açık kalır ve kapıyı
  // sunucu uygular.
  const canCreate = learn === null || learn[simId].complete === true;

  return (
    <>
      <div className="eg-shell-duel__grid">
        <section aria-labelledby="eg-duel-create" className="eg-shell-duel__card">
          <h2 className="eg-shell-duel__cardTitle" id="eg-duel-create">
            <icons.Target aria-hidden="true" className="eg-shell-duel__cardIcon" />
            {t("challenges.create.title")}
          </h2>
          <Button disabled={!canCreate} fullWidth loading={creating} onClick={() => void create()}>
            {t("challenges.create.action")}
          </Button>
          {learn !== null && !canCreate ? (
            <p className="eg-shell-duel__lockNote" role="note">
              {t("challenges.create.learnHint")}
            </p>
          ) : null}
          {created !== null ? <CodeCard challenge={created} /> : null}
        </section>
        <section aria-labelledby="eg-duel-join" className="eg-shell-duel__card">
          <h2 className="eg-shell-duel__cardTitle" id="eg-duel-join">
            <icons.Users aria-hidden="true" className="eg-shell-duel__cardIcon" />
            {t("challenges.join.title")}
          </h2>
          <form
            className="eg-shell-duel__join"
            onSubmit={(event) => {
              event.preventDefault();
              void join();
            }}
          >
            <Field error={codeError ?? undefined} label={t("challenges.join.label")}>
              {(control) => (
                <TextInput
                  {...control}
                  autoComplete="one-time-code"
                  className="eg-shell-duel__codeInput"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                  value={code}
                />
              )}
            </Field>
            <Button disabled={!canCreate} fullWidth loading={joining} type="submit" variant="secondary">
              {t("challenges.join.action")}
            </Button>
          </form>
          {learn !== null && !canCreate ? (
            <p className="eg-shell-duel__lockNote" role="note">
              {t("challenges.create.learnHint")}
            </p>
          ) : null}
        </section>
      </div>
      <section aria-labelledby="eg-duel-list" className="eg-shell-duel__listSection">
        <h2 className="eg-shell-section__title" id="eg-duel-list">
          {t("challenges.list.title")}
        </h2>
        {list === null ? null : list.length === 0 ? (
          <EmptyState description={t("challenges.list.empty")} icon={<icons.Trophy />} title={t("challenges.list.title")} />
        ) : (
          <ul className="eg-shell-duel__list">
            {list.map((challenge) => {
              const opponent = challenge.participants.find((participant) => !participant.isMe);
              return (
                <li className="eg-shell-duel__row" key={challenge.challengeId}>
                  <span className="eg-shell-duel__rowSim">{t(`sims.${challenge.simId}.name`)}</span>
                  <span className="eg-shell-duel__rowName">{opponent?.displayName ?? t("challenges.opponent.none")}</span>
                  <ChallengeStatusBadge challenge={challenge} />
                  <a className="eg-shell-duel__rowLink" href={challengeHref(challenge.simId, challenge.challengeId)}>
                    {t("challenges.list.open")}
                    <icons.ArrowRight aria-hidden="true" className="eg-shell-cta__icon" />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

export interface ChallengesPageProps {
  readonly session?: ShellSession | null;
  /** Merkezin sabit simi (`#/sims/<id>/meydan-okuma`); seçici yoktur. */
  readonly simId: SimId;
  /**
   * Sim içi yerleşimde birleşik bar h1 taşır; sayfa başlığı h2'ye iner ki
   * sayfada tek h1 kalsın (SimRoute ile aynı kural).
   */
  readonly headingLevel?: 1 | 2;
}

export function ChallengesPage({ session = null, simId, headingLevel = 1 }: ChallengesPageProps): JSX.Element {
  const sources = useShellDataSources();
  const source = useMemo(() => (sources === null ? null : sources.challenges(session)), [sources, session]);
  const learnSource = useMemo(() => (sources === null ? null : sources.learn(session)), [sources, session]);
  const [learn, setLearn] = useState<LearnStatus | null>(null);

  useEffect(() => {
    if (learnSource === null) return undefined;
    let cancelled = false;
    void learnSource
      .status()
      .then((status) => {
        if (!cancelled) setLearn(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [learnSource]);

  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <section className="eg-shell-page eg-shell-duel">
      <a className="eg-shell-duel__back" href={simScreenHref(simId, "modlar")}>
        <icons.ChevronLeft aria-hidden="true" className="eg-shell-cta__icon" />
        {t("challenges.backToModes")}
      </a>
      <header className="eg-shell-duel__hero">
        <Heading className="eg-shell-page__title">{t("challenges.title")}</Heading>
        <p className="eg-shell-duel__lead">{t("challenges.lead")}</p>
        <p className="eg-shell-duel__rules">{t("challenges.rules")}</p>
      </header>
      {isFacultyLike(session) ? (
        <EmptyState description={t("challenges.faculty.body")} icon={<icons.ShieldCheck />} title={t("challenges.faculty.title")} />
      ) : source === null ? (
        <EmptyState description={t("challenges.unavailable.body")} icon={<icons.Users />} title={t("challenges.unavailable.title")} />
      ) : (
        <ChallengeWorkspace learn={learn} simId={simId} source={source} />
      )}
    </section>
  );
}
