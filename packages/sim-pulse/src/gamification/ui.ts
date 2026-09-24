/** EGEMED Pulse — Başarılarım ve Liderlik görünümleri ile sonuç ekranı kazanımlar kartı.
 *  Yapısal DOM çizimi (S10–S13 deseni): saf görünüm modelleri + markup üretimi. */

import type {
  BadgeView,
  CohortFilter,
  LevelInfo,
  Period,
  StreakInfo,
  WeeklyGoalsResult,
} from "@egemed/gamification-core";
import {
  BADGE_CATEGORY_LABEL,
  BADGE_TIER_LABEL,
  badgeViews,
  computeStreak,
  computeWeeklyGoals,
  levelForXp,
  sortBadgeViews,
  totalXpFor,
} from "@egemed/gamification-core";
import { MODES } from "../engine/shapes";
import { PULSE_BADGES } from "./catalog";
import type { PulseStats } from "./catalog";
import { computePulseStats } from "./repo";
import type { PulseGamiState, PulseLeaderboardRow, PulseLeaderboardView } from "./repo";
import { PULSE_RULES } from "./rules";

export const PULSE_PERIODS: readonly Period[] = ["today", "week", "month", "academic_year"];

export const PULSE_PERIOD_LABELS: Record<Period, string> = {
  today: "Bugün",
  week: "Bu hafta",
  month: "Bu ay",
  academic_year: "Akademik yıl",
};

export const PULSE_COHORTS: readonly CohortFilter[] = ["all", 1, 2, 3, 4, 5, 6];

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll("\"", "&quot;");

const trOne = (value: number): string =>
  value.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const progressBar = (value: number, max: number, label: string): string => {
  const safeMax = Math.max(1, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  const percent = Math.round((safeValue / safeMax) * 100);
  return `<span class="domain-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${safeValue}" aria-label="${escapeHtml(label)}"><i style="width:${percent}%"></i></span>`;
};

export interface PulseAchievementsView {
  readonly hasAttempts: boolean;
  readonly totalXp: number;
  readonly level: LevelInfo;
  readonly streak: StreakInfo;
  readonly goals: WeeklyGoalsResult;
  readonly badges: readonly BadgeView<PulseStats>[];
  readonly earnedCount: number;
  readonly assessmentCount: number;
  readonly practiceCount: number;
  readonly masteredModes: number;
  readonly modeTotal: number;
}

export function createPulseAchievementsView(state: PulseGamiState, now: Date): PulseAchievementsView {
  const stats = computePulseStats(state.attempts);
  const badges = sortBadgeViews(badgeViews(PULSE_BADGES, stats, state.earned, { now }));
  const totalXp = totalXpFor(state.attempts, state.learn, PULSE_RULES);
  return {
    hasAttempts: state.attempts.length > 0,
    totalXp,
    level: levelForXp(totalXp, PULSE_RULES),
    streak: computeStreak(state.attempts, now),
    goals: computeWeeklyGoals(state.attempts, state.earned, now, PULSE_RULES),
    badges,
    earnedCount: badges.filter((badge) => badge.state === "earned").length,
    assessmentCount: state.attempts.filter((attempt) => attempt.mode === "assessment").length,
    practiceCount: state.attempts.filter((attempt) => attempt.mode === "practice").length,
    masteredModes: Object.keys(stats.modeMastery).length,
    modeTotal: MODES.length,
  };
}

function badgeCardMarkup(badge: BadgeView<PulseStats>): string {
  const def = badge.def;
  const meta = [def.tier ? BADGE_TIER_LABEL[def.tier] : null, BADGE_CATEGORY_LABEL[def.category]]
    .filter((part): part is string => part !== null)
    .join(" · ");
  const status = badge.state === "earned" ? "Kazanıldı" : badge.state === "progress" ? `${badge.value}/${badge.max}` : "Kilitli";
  return `<article class="case-card" data-state="${badge.state}" data-badge="${escapeHtml(def.id)}">` +
    `<h3>${escapeHtml(def.name)}</h3><p>${escapeHtml(def.description)}</p>` +
    `<div class="chips"><span class="chip">${escapeHtml(meta)}</span><span class="chip">${escapeHtml(status)}</span></div>` +
    (badge.state === "earned" ? "" : progressBar(badge.value, badge.max, def.name)) +
    `</article>`;
}

export function achievementsMarkup(view: PulseAchievementsView): string {
  const head = `<h1 class="results-title-v2">Başarılarım</h1>` +
    `<p class="results-sub-v2">Değerlendirme ve uygulama oturumlarından kazandığın ilerleme; rozetler yalnız bu cihazda saklanır.</p>`;
  if (!view.hasAttempts) {
    return head + `<section class="card"><h2>Henüz kazanım yok</h2>` +
      `<p>İlk değerlendirme oturumunu tamamladığında puan, düzey ve rozetler burada listelenir.</p>` +
      `<button type="button" class="btn primary" data-pulse-view="quiz">Değerlendirmeye gir</button></section>`;
  }
  const summary = `<div class="chips" aria-label="Kazanım özeti">` +
    `<span class="chip">Düzey ${view.level.level}</span>` +
    `<span class="chip">${view.totalXp} XP</span>` +
    `<span class="chip">${view.streak.current} gün seri</span>` +
    `<span class="chip">${view.earnedCount}/${view.badges.length} rozet</span>` +
    `<span class="chip">${view.masteredModes}/${view.modeTotal} EKG örüntüsü</span></div>`;
  const goals = view.goals.goals.map((goal) =>
    `<div class="domain-row-v2">` +
    `<span class="dr-ic" aria-hidden="true">${goal.done ? "✓" : "•"}</span>` +
    `<span class="dr-lbl">${escapeHtml(goal.label)}</span>` +
    progressBar(goal.value, goal.max, goal.label) +
    `<span class="dr-pct">${goal.value}/${goal.max}</span>` +
    `</div>`).join("");
  return head +
    `<section class="card" aria-labelledby="gami-summary-t"><h2 id="gami-summary-t">Profil</h2>${summary}` +
    `<p class="mt-8">Değerlendirme: ${view.assessmentCount} · Uygulama: ${view.practiceCount}</p></section>` +
    `<section class="card mt-12" aria-labelledby="gami-goals-t"><h2 id="gami-goals-t">Bu haftanın hedefleri</h2>` +
    `<div class="domain-rows">${goals}</div>` +
    `<p class="mt-8">Hedefler her Pazartesi 00:00'da (TSİ) yenilenir.</p></section>` +
    `<section class="card mt-12" aria-labelledby="gami-badges-t"><h2 id="gami-badges-t">Rozetler</h2>` +
    `<div class="detail-cards">${view.badges.map(badgeCardMarkup).join("")}</div></section>`;
}

export interface PulseLeaderboardTableView {
  readonly period: Period;
  readonly cohort: CohortFilter;
  readonly rows: readonly PulseLeaderboardRow[];
  readonly me: PulseLeaderboardRow | null;
  readonly empty: boolean;
}

export function createPulseLeaderboardView(board: PulseLeaderboardView): PulseLeaderboardTableView {
  const rows = [...board.rows].sort((a, b) =>
    (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  return {
    period: board.period,
    cohort: board.cohort,
    rows,
    me: rows.find((row) => row.isMe) ?? null,
    empty: rows.length === 0,
  };
}

export function leaderboardMarkup(view: PulseLeaderboardTableView): string {
  const head = `<h1 class="results-title-v2">Liderlik Tahtası</h1>` +
    `<p class="results-sub-v2">Dönem puanı, değerlendirme modundaki en iyi üç oturumun ortalamasıdır; sıralamaya girmek için en az iki değerlendirme gerekir.</p>`;
  const periods = PULSE_PERIODS.map((period) =>
    `<button type="button" class="tool-btn" data-pulse-gami-period="${period}" aria-pressed="${period === view.period}">${PULSE_PERIOD_LABELS[period]}</button>`).join("");
  const cohorts = PULSE_COHORTS.map((cohort) =>
    `<option value="${cohort}"${cohort === view.cohort ? " selected" : ""}>${cohort === "all" ? "Tüm dönemler" : `Dönem ${cohort}`}</option>`).join("");
  const controls = `<div class="chips" role="group" aria-label="Dönem">${periods}</div>` +
    `<div class="chips mt-8"><span>Kohort</span><select name="gamiCohort" data-pulse-gami-cohort aria-label="Kohort">${cohorts}</select></div>`;
  const qualify = view.me !== null && view.me.rank === null
    ? `<p class="mt-8">Sıralamaya girmek için bu dönem ${Math.max(1, PULSE_RULES.ranking.minAttempts - view.me.attemptsCount)} değerlendirme daha tamamla.</p>`
    : "";
  if (view.empty) {
    return head + controls + `<section class="card mt-12"><p>Bu dönemde henüz sıralamaya giren yok.</p></section>`;
  }
  const body = view.rows.map((row) => {
    const name = row.isMe ? `Sen · ${row.displayName}` : row.displayName;
    const score = row.periodScore === null ? "—" : trOne(row.periodScore);
    return `<tr${row.isMe ? ' aria-current="true"' : ""}><td>${row.rank ?? "—"}</td>` +
      `<td>${escapeHtml(name)}</td><td>${escapeHtml(score)}</td>` +
      `<td>${row.attemptsCount}</td><td>${row.level}</td><td>${row.totalXp.toLocaleString("tr-TR")}</td></tr>`;
  }).join("");
  return head + controls + qualify +
    `<div class="table-scroll mt-12"><table class="report-table report-table-v2" aria-label="Liderlik tablosu">` +
    `<thead><tr><th>#</th><th>Kullanıcı</th><th>Dönem puanı</th><th>Deneme</th><th>Seviye</th><th>Toplam XP</th></tr></thead>` +
    `<tbody>${body}</tbody></table></div>` +
    `<p class="mt-8">Tablodaki diğer öğrenciler demo verisidir; gerçek sıralama LMS verisiyle doldurulacaktır.</p>`;
}

export interface PulseGainsView {
  readonly newlyEarned: readonly BadgeView<PulseStats>[];
  readonly totalXp: number;
  readonly level: number;
  readonly earnedCount: number;
  readonly totalCount: number;
}

export function createPulseGainsView(
  state: PulseGamiState,
  earnedIds: readonly string[],
  now: Date,
): PulseGainsView {
  const all = badgeViews(PULSE_BADGES, computePulseStats(state.attempts), state.earned, { now });
  const earned = new Set(earnedIds);
  const totalXp = totalXpFor(state.attempts, state.learn, PULSE_RULES);
  return {
    newlyEarned: sortBadgeViews(all.filter((badge) => earned.has(badge.def.id))),
    totalXp,
    level: levelForXp(totalXp, PULSE_RULES).level,
    earnedCount: all.filter((badge) => badge.state === "earned").length,
    totalCount: all.length,
  };
}

export function gainsMarkup(view: PulseGainsView): string {
  const badges = view.newlyEarned.length > 0
    ? `<div class="chips">${view.newlyEarned.map((badge) => `<span class="chip">${escapeHtml(badge.def.name)}</span>`).join("")}</div>`
    : `<p>Yeni rozet yok; ilerlemen Başarılarım sayfasında birikmeye devam ediyor.</p>`;
  return `<section class="card mt-12" aria-labelledby="gami-gains-t"><h2 id="gami-gains-t">Kazanımlar</h2>` +
    `<p>Düzey ${view.level} · ${view.totalXp} XP · ${view.earnedCount}/${view.totalCount} rozet</p>${badges}` +
    `<button type="button" class="btn primary mt-8" data-pulse-view="achievements">Başarılarımı gör</button></section>`;
}
