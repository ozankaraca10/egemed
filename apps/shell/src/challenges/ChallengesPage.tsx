import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { Button, EmptyState, Field, Select, TextInput, icons, useToast, type SelectOption } from "@egemed/ui";
import { t, type TrKey } from "@egemed/ui/i18n";
import type { ChallengeBody, LearnStatus, SimId } from "@egemed/contracts";
import { useShellDataSources } from "../dataSources";
import { challengeHref, challengePlayHref } from "../routes";
import type { ShellSession } from "../session";
import { challengeErrorKey, outcomeFor, type ChallengeSource } from "./challengeSource";

/**
 * Meydan Okuma sayfası (ADR-010): yeni düello (kod), kodla katılma ve düellolarım.
 * Kullanıcı arama/liste yoktur; rakip yalnız kodu paylaşarak davet edilir (KVKK).
 * Öğrenme kilidi (27 Eyl 2026): öğrenmesi tamamlanmamış sim seçilemez ve düello
 * oluşturulamaz; sunucu da aynı kuralı uygular (`learn_required`).
 */

const SIM_OPTIONS: readonly { readonly value: SimId; readonly enabled: boolean }[] = [
  { value: "ausculta", enabled: true },
  { value: "opaca", enabled: false },
  { value: "pulse", enabled: false },
];

/**
 * Sim seçici seçenekleri: düello desteklemeyen sim "yakında"; destekleyen simin
 * öğrenmesi tamamlanmadıysa pasif ve öğrenme ipucu etiketiyle çizilir. Durum
 * henüz okunmadıysa (`null`) seçenek açık kalır: kapıyı sunucu kesin uygular
 * (`learn_required`), geçici bir okuma hatası kullanıcıyı kilitlemez.
 */
export function challengeSimOptions(learn: LearnStatus | null): readonly SelectOption[] {
  return SIM_OPTIONS.map((option) => {
    const name = t(`sims.${option.value}.name`);
    if (!option.enabled) return { value: option.value, label: `${name} · ${t("challenges.create.soon")}`, disabled: true };
    if (learn !== null && learn[option.value].complete !== true) {
      return { value: option.value, label: `${name} · ${t("challenges.create.learnHint")}`, disabled: true };
    }
    return { value: option.value, label: name, disabled: false };
  });
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
}: {
  readonly source: ChallengeSource;
  /** Öğrenme tamamlama durumu; null iken durum henüz okunmamıştır (kapı sunucuda). */
  readonly learn?: LearnStatus | null;
}): JSX.Element {
  const toast = useToast();
  const [simId, setSimId] = useState<SimId>("ausculta");
  const [created, setCreated] = useState<ChallengeBody | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [list, setList] = useState<readonly ChallengeBody[] | null>(null);

  const refresh = useCallback(() => {
    void source
      .list()
      .then(setList)
      .catch(() => setList([]));
  }, [source]);
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
      navigate(challengeHref(challenge.challengeId));
    } catch (error) {
      setCodeError(t(challengeErrorKey(error)));
    } finally {
      setJoining(false);
    }
  };

  const simOptions = useMemo(() => challengeSimOptions(learn), [learn]);
  // Öğrenme kilidi: seçili simin tamamlanma kaydı yoksa oluşturulamaz; durum
  // henüz okunmadıysa düğme açık kalır ve kapıyı sunucu uygular.
  const canCreate = learn === null || learn[simId].complete === true;

  return (
    <>
      <div className="eg-shell-duel__grid">
        <section aria-labelledby="eg-duel-create" className="eg-shell-duel__card">
          <h2 className="eg-shell-duel__cardTitle" id="eg-duel-create">
            <icons.Target aria-hidden="true" className="eg-shell-duel__cardIcon" />
            {t("challenges.create.title")}
          </h2>
          <Field label={t("challenges.create.sim")}>
            {(control) => <Select {...control} onValueChange={(value) => setSimId(value as SimId)} options={simOptions} value={simId} />}
          </Field>
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
            <Button fullWidth loading={joining} type="submit" variant="secondary">
              {t("challenges.join.action")}
            </Button>
          </form>
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
                  <a className="eg-shell-duel__rowLink" href={challengeHref(challenge.challengeId)}>
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

export function ChallengesPage({ session = null }: { readonly session?: ShellSession | null }): JSX.Element {
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

  return (
    <section className="eg-shell-page eg-shell-duel">
      <header className="eg-shell-duel__hero">
        <h1 className="eg-shell-page__title">{t("challenges.title")}</h1>
        <p className="eg-shell-duel__lead">{t("challenges.lead")}</p>
        <p className="eg-shell-duel__rules">{t("challenges.rules")}</p>
      </header>
      {session?.faculty === true ? (
        <EmptyState description={t("challenges.faculty.body")} icon={<icons.ShieldCheck />} title={t("challenges.faculty.title")} />
      ) : source === null ? (
        <EmptyState description={t("challenges.unavailable.body")} icon={<icons.Users />} title={t("challenges.unavailable.title")} />
      ) : (
        <ChallengeWorkspace learn={learn} source={source} />
      )}
    </section>
  );
}
