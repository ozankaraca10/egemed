import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { EmptyState, icons, useToast } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import type { ChallengeBody, LearnStatus, SimId } from "@egemed/contracts";
import { useShellDataSources } from "../dataSources";
import { challengeHref, simScreenHref } from "../routes";
import { isFacultyLike, type ShellSession } from "../session";
import { ArenaEyebrow, CareerPanel, CodeTiles, DuelRow, DuelRules, DuelStage, Versus } from "./arena/ArenaParts";
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

/** Sunucu kuralları (`apps/api` CHALLENGE_*): liste boşken kural haplarında gösterilir. */
const DEFAULT_RULES = { caseCount: 10, perCaseLimitMs: 2 * 60_000, totalLimitMs: 8 * 60_000 } as const;

function isActive(challenge: ChallengeBody): boolean {
  return challenge.winner === null && challenge.status !== "expired";
}

function CreatedCode({ challenge }: { readonly challenge: ChallengeBody }): JSX.Element | null {
  const toast = useToast();
  if (challenge.code === null) return null;
  return (
    <div className="eg-shell-arena__center" aria-live="polite">
      <CodeTiles code={challenge.code} />
      <p className="eg-shell-arena__lock">{t("challenges.code.expires")}</p>
      <div className="eg-shell-arena__actions">
        <button
          className="eg-shell-arena__cta eg-shell-arena__cta--ghost"
          onClick={() => {
            void copyText(challenge.code ?? "")
              .then(() => toast({ title: t("challenges.code.copied"), tone: "success" }))
              .catch(() => undefined);
          }}
          type="button"
        >
          <icons.ClipboardList aria-hidden="true" className="eg-shell-arena__ctaIcon" />
          {t("challenges.code.copy")}
        </button>
        <a className="eg-shell-arena__cta eg-shell-arena__cta--gold" href={challengeHref(challenge.simId, challenge.challengeId)}>
          {t("challenges.lobby.eyebrow")}
          <icons.ArrowRight aria-hidden="true" className="eg-shell-arena__ctaIcon" />
        </a>
      </div>
    </div>
  );
}

export function ChallengeWorkspace({
  source,
  learn = null,
  simId,
  myName = null,
}: {
  readonly source: ChallengeSource;
  /** Öğrenme tamamlama durumu; null iken durum henüz okunmamıştır (kapı sunucuda). */
  readonly learn?: LearnStatus | null;
  /** Merkezin sabit simi; oluşturma bu sim için yapılır ve liste buna göre süzülür. */
  readonly simId: SimId;
  /** VS kompozisyonunda "Sen" tarafının adı (sahte oturumda yok). */
  readonly myName?: string | null;
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
  const lockNote = learn !== null && !canCreate ? (
    <p className="eg-shell-arena__lock" role="note">{t("challenges.create.learnHint")}</p>
  ) : null;
  const rules = list?.[0] ?? DEFAULT_RULES;
  const active = (list ?? []).filter(isActive);
  const history = (list ?? []).filter((challenge) => !isActive(challenge));

  return (
    <>
      <DuelStage label={t("challenges.arena.eyebrow")}>
        <div className="eg-shell-arena__hero">
          <div>
            <ArenaEyebrow>{t("challenges.arena.eyebrow")}</ArenaEyebrow>
            <p className="eg-shell-arena__title">{t("challenges.arena.title")}</p>
            <p className="eg-shell-arena__lead">{t("challenges.arena.lead")}</p>
          </div>
          <Versus compact me={{ side: "me", name: myName ?? t("challenges.arena.me") }} rival={{ side: "rival", name: null, waiting: true }} />
        </div>
        <DuelRules caseCount={rules.caseCount} perCaseLimitMs={rules.perCaseLimitMs} totalLimitMs={rules.totalLimitMs} />
        <div className="eg-shell-arena__moves">
          <section aria-labelledby="eg-duel-create" className="eg-shell-arena__move">
            <h3 className="eg-shell-arena__moveTitle" id="eg-duel-create">{t("challenges.arena.invite.title")}</h3>
            <p className="eg-shell-arena__moveText">{t("challenges.arena.invite.body")}</p>
            {created !== null ? (
              <CreatedCode challenge={created} />
            ) : (
              <button className="eg-shell-arena__cta eg-shell-arena__cta--gold" disabled={!canCreate || creating} onClick={() => void create()} type="button">
                <icons.Medal aria-hidden="true" className="eg-shell-arena__ctaIcon" />
                {t("challenges.arena.invite.action")}
              </button>
            )}
            {lockNote}
          </section>
          <section aria-labelledby="eg-duel-join" className="eg-shell-arena__move">
            <h3 className="eg-shell-arena__moveTitle" id="eg-duel-join">{t("challenges.join.title")}</h3>
            <p className="eg-shell-arena__moveText">{t("challenges.arena.join.body")}</p>
            <form
              className="eg-shell-arena__center"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void join();
              }}
            >
              <label className="eg-shell-arena__lock" htmlFor="eg-duel-code">{t("challenges.join.label")}</label>
              <input
                aria-describedby={codeError === null ? undefined : "eg-duel-code-error"}
                aria-invalid={codeError !== null}
                autoComplete="one-time-code"
                className="eg-shell-arena__codeInput"
                id="eg-duel-code"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
                value={code}
              />
              {codeError !== null ? <p className="eg-shell-arena__error" id="eg-duel-code-error" role="alert">{codeError}</p> : null}
              <button className="eg-shell-arena__cta eg-shell-arena__cta--ghost" disabled={!canCreate || joining} type="submit">
                {t("challenges.join.action")}
                <icons.ArrowRight aria-hidden="true" className="eg-shell-arena__ctaIcon" />
              </button>
            </form>
            {lockNote}
          </section>
        </div>
      </DuelStage>
      <div className="eg-shell-arena__below">
        <section aria-labelledby="eg-duel-list" className="eg-shell-arena__panel">
          <h2 className="eg-shell-arena__panelTitle" id="eg-duel-list">
            {t("challenges.arena.active")}
            <span className="eg-shell-arena__muted eg-shell-arena__num">{active.length}</span>
          </h2>
          {list === null ? null : list.length === 0 ? (
            <p className="eg-shell-arena__muted">{t("challenges.arena.empty")}</p>
          ) : (
            <>
              {active.length > 0 ? (
                <ul className="eg-shell-arena__list">
                  {active.map((challenge) => <DuelRow challenge={challenge} href={challengeHref(challenge.simId, challenge.challengeId)} key={challenge.challengeId} />)}
                </ul>
              ) : null}
              {history.length > 0 ? (
                <>
                  <h3 className="eg-shell-arena__panelTitle">{t("challenges.arena.history")}</h3>
                  <ul className="eg-shell-arena__list">
                    {history.map((challenge) => <DuelRow challenge={challenge} href={challengeHref(challenge.simId, challenge.challengeId)} key={challenge.challengeId} />)}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </section>
        <CareerPanel challenges={list ?? []} />
      </div>
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
    <section className="eg-shell-page eg-shell-arena">
      <a className="eg-shell-duel__back" href={simScreenHref(simId, "modlar")}>
        <icons.ChevronLeft aria-hidden="true" className="eg-shell-cta__icon" />
        {t("challenges.backToModes")}
      </a>
      <Heading className="eg-shell-page__title">
        {t("challenges.title")}
      </Heading>
      {isFacultyLike(session) ? (
        <EmptyState description={t("challenges.faculty.body")} icon={<icons.ShieldCheck />} title={t("challenges.faculty.title")} />
      ) : source === null ? (
        <EmptyState description={t("challenges.unavailable.body")} icon={<icons.Users />} title={t("challenges.unavailable.title")} />
      ) : (
        <ChallengeWorkspace learn={learn} myName={session?.displayName ?? null} simId={simId} source={source} />
      )}
    </section>
  );
}
