import type { JSX, ReactNode } from "react";
import { icons } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";
import type { ChallengeBody } from "@egemed/contracts";
import { DUEL_BADGE_RULES } from "@egemed/gami-catalogs";
import { outcomeFor } from "../challengeSource";

/**
 * T287 — Meydan Okuma arenası yapı taşları (1v1 düello dili). Sayfalar bu
 * parçalardan kurulur: karanlık sahne, VS kompozisyonu, kural hapları, davet kodu
 * karoları, adil oyun uyarısı, düello satırı ve kariyer paneli. Renkler token'dan.
 */

type Form = "win" | "loss" | "draw";

export function initialsOf(name: string): string {
  const parts = name.replace(/\./g, " ").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : (parts[0] ?? "").slice(0, 2);
  return letters.toLocaleUpperCase("tr-TR") || "?";
}

export function DuelStage({ children, label }: { readonly children: ReactNode; readonly label: string }): JSX.Element {
  return (
    <section aria-label={label} className="eg-shell-arena__stage">
      {children}
    </section>
  );
}

export function ArenaEyebrow({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <span className="eg-shell-arena__eyebrow">
      <icons.Medal aria-hidden="true" className="eg-shell-arena__eyebrowIcon" />
      {children}
    </span>
  );
}

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} dk`;
}

export function DuelRules({ caseCount, perCaseLimitMs, totalLimitMs }: { readonly caseCount: number; readonly perCaseLimitMs: number; readonly totalLimitMs: number }): JSX.Element {
  return (
    <ul aria-label={t("challenges.title")} className="eg-shell-arena__rules">
      <li className="eg-shell-arena__rule"><b className="eg-shell-arena__num">{caseCount}</b> {t("challenges.arena.rule.cases")}</li>
      <li className="eg-shell-arena__rule">{t("challenges.arena.rule.perCase")} <b className="eg-shell-arena__num">{minutes(perCaseLimitMs)}</b></li>
      <li className="eg-shell-arena__rule">{t("challenges.arena.rule.total")} <b className="eg-shell-arena__num">{minutes(totalLimitMs)}</b></li>
      <li className="eg-shell-arena__rule">{t("challenges.arena.rule.noHint")}</li>
      <li className="eg-shell-arena__rule"><b>{t("challenges.arena.rule.xp")}</b></li>
    </ul>
  );
}

/** Adil oyun uyarısı (depo sahibi kararı 30 Eyl 2026; ADR-009 önlem paketi). */
export function FairPlayNotice({ tone = "light" }: { readonly tone?: "light" | "dark" }): JSX.Element {
  return (
    <div className={`eg-shell-fair eg-shell-fair--${tone}`} role="note">
      <span aria-hidden="true" className="eg-shell-fair__icon"><icons.ShieldCheck /></span>
      <p className="eg-shell-fair__text"><b>{t("challenges.fair.title")}</b> {t("challenges.fair.body")}</p>
    </div>
  );
}

export interface FighterProps {
  readonly side: "me" | "rival";
  readonly name: string | null;
  readonly state?: string;
  readonly waiting?: boolean;
  readonly crowned?: boolean;
  readonly compact?: boolean;
}

export function Fighter({ side, name, state, waiting = false, crowned = false, compact = false }: FighterProps): JSX.Element {
  const cls = `eg-shell-arena__fighter eg-shell-arena__fighter--${side}${waiting ? " eg-shell-arena__fighter--waiting" : ""}`;
  return (
    <div className={cls}>
      <span aria-hidden="true" className="eg-shell-arena__avatar">
        {crowned ? <icons.Trophy className="eg-shell-arena__crown" /> : null}
        {waiting || name === null ? "?" : initialsOf(name)}
      </span>
      <span className="eg-shell-arena__tag">{t(side === "me" ? "challenges.arena.me" : "challenges.arena.rival")}</span>
      {compact ? null : <span className="eg-shell-arena__name">{name ?? t("challenges.lobby.rivalWaiting")}</span>}
      {compact || state === undefined ? null : <span className="eg-shell-arena__state">{state}</span>}
    </div>
  );
}

export function Versus({ me, rival, center, compact = false }: { readonly me: FighterProps; readonly rival: FighterProps; readonly center?: ReactNode; readonly compact?: boolean }): JSX.Element {
  return (
    <div className={`eg-shell-arena__versus${compact ? " eg-shell-arena__versus--compact" : ""}`}>
      <Fighter {...me} compact={compact} />
      <span aria-hidden="true" className="eg-shell-arena__vs">{center ?? t("challenges.arena.vs")}</span>
      <Fighter {...rival} compact={compact} />
    </div>
  );
}

export function CodeTiles({ code }: { readonly code: string }): JSX.Element {
  return (
    <p aria-label={`${t("challenges.code.label")}: ${code.split("").join(" ")}`} className="eg-shell-arena__code">
      {code.split("").map((digit, index) => (
        <span aria-hidden="true" className="eg-shell-arena__codeDigit" key={index}>{digit}</span>
      ))}
    </p>
  );
}

const FORM_LETTER: Record<Form, string> = { win: "G", loss: "M", draw: "B" };
const FORM_LABEL: Record<Form, string> = { win: "Galibiyet", loss: "Mağlubiyet", draw: "Berabere" };

/** Son sonuçlar şeridi (G/B/M); renk dışında harfle de ayırt edilir. */
export function FormStrip({ form, label }: { readonly form: readonly Form[]; readonly label: string }): JSX.Element | null {
  if (form.length === 0) return null;
  return (
    <span aria-label={`${label}: ${form.map((entry) => FORM_LABEL[entry]).join(", ")}`} className="eg-shell-arena__form" role="img">
      {form.map((entry, index) => (
        <i aria-hidden="true" className={`eg-shell-arena__formDot eg-shell-arena__formDot--${entry}`} key={index}>{FORM_LETTER[entry]}</i>
      ))}
    </span>
  );
}

function rowChip(challenge: ChallengeBody): { readonly tone: string; readonly text: string } {
  const outcome = outcomeFor(challenge);
  if (outcome === "win") return { tone: "win", text: t("challenges.arena.wins") };
  if (outcome === "lose") return { tone: "loss", text: t("challenges.arena.losses") };
  if (outcome === "draw") return { tone: "draw", text: t("challenges.arena.draws") };
  if (challenge.status === "expired") return { tone: "draw", text: t("challenges.status.expired") };
  const me = challenge.participants.find((participant) => participant.isMe);
  const rival = challenge.participants.find((participant) => !participant.isMe);
  if (rival === undefined) return { tone: "wait", text: t("challenges.arena.waiting") };
  if (me !== undefined && !me.finished) return { tone: "turn", text: t("challenges.arena.turn") };
  return { tone: "wait", text: t("challenges.arena.rivalTurn") };
}

function scoreLine(challenge: ChallengeBody): string | null {
  const me = challenge.participants.find((participant) => participant.isMe);
  const rival = challenge.participants.find((participant) => !participant.isMe);
  if (me?.score === null || me?.score === undefined || rival?.score === null || rival?.score === undefined) return null;
  return `${Math.round(me.score)} – ${Math.round(rival.score)}`;
}

export function DuelRow({ challenge, href }: { readonly challenge: ChallengeBody; readonly href: string }): JSX.Element {
  const me = challenge.participants.find((participant) => participant.isMe);
  const rival = challenge.participants.find((participant) => !participant.isMe);
  const chip = rowChip(challenge);
  const score = scoreLine(challenge);
  const title = rival?.displayName ?? (challenge.code === null ? t("challenges.opponent.none") : `${t("challenges.arena.inviteRow")} ${challenge.code}`);
  return (
    <li>
      <a className="eg-shell-arena__row" href={href}>
        <span aria-hidden="true" className="eg-shell-arena__pair">
          <i className="eg-shell-arena__mini eg-shell-arena__mini--me">{initialsOf(me?.displayName ?? "")}</i>
          <em className="eg-shell-arena__miniVs">vs</em>
          <i className={`eg-shell-arena__mini ${rival === undefined ? "eg-shell-arena__mini--empty" : "eg-shell-arena__mini--rival"}`}>{rival === undefined ? "?" : initialsOf(rival.displayName)}</i>
        </span>
        <span className="eg-shell-arena__rowMain">
          <span className="eg-shell-arena__rowTitle">
            {title}
            {rival !== undefined ? <FormStrip form={rival.recentForm} label={`${rival.displayName} · ${t("challenges.arena.form")}`} /> : null}
          </span>
          <span className="eg-shell-arena__rowMeta">{score ?? t(`challenges.status.${challenge.status}`)}</span>
        </span>
        <span className={`eg-shell-arena__chip eg-shell-arena__chip--${chip.tone}`}>{chip.text}</span>
      </a>
    </li>
  );
}

function nextThreshold(value: number, steps: readonly number[]): number {
  return steps.find((step) => step > value) ?? steps[steps.length - 1] ?? 1;
}

/** Kariyer: bu simdeki sonuçlanmış düellolar (yalnız görüntüleyenin kendi düelloları). */
export function CareerPanel({ challenges }: { readonly challenges: readonly ChallengeBody[] }): JSX.Element {
  const done = challenges.filter((challenge) => challenge.winner !== null);
  const outcomes = done.map(outcomeFor);
  const wins = outcomes.filter((outcome) => outcome === "win").length;
  const draws = outcomes.filter((outcome) => outcome === "draw").length;
  const losses = outcomes.filter((outcome) => outcome === "lose").length;
  const form = outcomes.slice(0, 5).map((outcome): Form => (outcome === "win" ? "win" : outcome === "lose" ? "loss" : "draw"));
  const rivals = new Set(done.map((challenge) => challenge.participants.find((participant) => !participant.isMe)?.displayName).filter(Boolean)).size;
  const winTarget = nextThreshold(wins, DUEL_BADGE_RULES.wins);
  const rivalTarget = nextThreshold(rivals, DUEL_BADGE_RULES.rivals);
  return (
    <section aria-labelledby="eg-arena-career" className="eg-shell-arena__panel">
      <h2 className="eg-shell-arena__panelTitle" id="eg-arena-career">{t("challenges.arena.career")}</h2>
      <FairPlayNotice />
      <dl className="eg-shell-arena__stats">
        <div className="eg-shell-arena__stat eg-shell-arena__stat--win"><dt>{t("challenges.arena.wins")}</dt><dd>{wins}</dd></div>
        <div className="eg-shell-arena__stat"><dt>{t("challenges.arena.draws")}</dt><dd>{draws}</dd></div>
        <div className="eg-shell-arena__stat eg-shell-arena__stat--loss"><dt>{t("challenges.arena.losses")}</dt><dd>{losses}</dd></div>
      </dl>
      {form.length > 0 ? (
        <div className="eg-shell-arena__careerRow">
          <span className="eg-shell-arena__muted">{t("challenges.arena.form")}</span>
          <FormStrip form={form} label={t("challenges.arena.form")} />
        </div>
      ) : null}
      <Progress label={`${t("challenges.arena.nextBadge")} · ${t("challenges.arena.wins")}`} max={winTarget} value={Math.min(wins, winTarget)} />
      <Progress label={t("challenges.arena.rivals")} max={rivalTarget} value={Math.min(rivals, rivalTarget)} />
      <p className="eg-shell-arena__muted">{t("challenges.arena.noRanking")}</p>
    </section>
  );
}

function Progress({ label, value, max }: { readonly label: string; readonly value: number; readonly max: number }): JSX.Element {
  return (
    <div className="eg-shell-arena__progress">
      <span className="eg-shell-arena__muted">{label}</span>
      <span aria-hidden="true" className="eg-shell-arena__track"><i style={{ width: `${Math.round((value / Math.max(1, max)) * 100)}%` }} /></span>
      <span className="eg-shell-arena__muted eg-shell-arena__num">{value} / {max}</span>
    </div>
  );
}
