/**
 * T186 — Aylık ödüller (admin) için DOM'suz veri katmanı + saf form/durum
 * yardımcıları. `@egemed/contracts` `packages/contracts/src/schemas/rewards.ts`
 * ile aynı sözleşmeyi paylaşır (T177/T178 ile birleşti); `apps/shell` bu
 * pakete zaten bağımlı olduğu için (AGENTS.md: yeni bağımlılık YOK) alan
 * adları ve sınırlar buradan içe aktarılır, yinelenmez.
 *
 * `apps/api` `GET/PUT/DELETE /admin/rewards*` sunar (T177); ekran veriyi bu
 * `RewardsDataSource` arayüzü üzerinden enjekte alır (`usersDataSource.ts`
 * deseniyle aynı). Geliştirmede tohumlu, sentetik bir kaynak kullanılır;
 * içeriği `packages/sim-opaca/src/gamification/rewards.ts`ten SADECE OKUNARAK
 * örneklenir (o dosya değiştirilmez/içe aktarılmaz — plan kapsamı dışıdır).
 */

import {
  REWARD_COHORTS,
  REWARD_MONTH_PATTERN,
  type RewardBody,
  type RewardUpsertRequest,
  type RewardWinnerBody,
  type SimId,
} from "@egemed/contracts";
import { REWARD_SEED } from "@egemed/gami-catalogs";

export type { SimId };
export { REWARD_COHORTS };

export const REWARD_SIM_IDS: readonly SimId[] = ["pulse", "ausculta", "opaca"];

export type AdminReward = RewardBody & { readonly winners: readonly RewardWinnerBody[] };

export type RewardStatus = "draft" | "current" | "finalized";

const TR_MONTHS_FULL = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

/** "2026-09" → "Eylül 2026" (Europe/Istanbul takvim ayı; girdi zaten ay anahtarı, saat dilimi çevirisi gerekmez). */
export function monthLabelTr(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const monthIndex = Number(monthRaw) - 1;
  const name = TR_MONTHS_FULL[monthIndex] ?? month;
  return `${name} ${yearRaw ?? ""}`.trim();
}

/** "2026-09" → "2026-10" (Aralık → sonraki yıl Ocak'a döner). */
export function nextMonthKey(month: string): string {
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const next = monthIndex === 11 ? { m: 1, y: year + 1 } : { m: monthIndex + 2, y: year };
  return `${next.y}-${String(next.m).padStart(2, "0")}`;
}

/** Ay kapandı mı (geçmiş ay): yalnız içinde bulunulan aydan STRICT önceki aylar kapalı sayılır. */
export function isMonthClosed(month: string, currentMonthKey: string): boolean {
  return month < currentMonthKey;
}

/** Durum rozeti: kesinleşti > bu ay geçerli > taslak (E4 ekran maddesi 2). */
export function rewardStatusFor(reward: { readonly month: string; readonly finalizedAt: string | null }, currentMonthKey: string): RewardStatus {
  if (reward.finalizedAt !== null) return "finalized";
  if (reward.month === currentMonthKey) return "current";
  return "draft";
}

/** En yeni ay önce (liste sırası, E4 ekran maddesi 2). */
export function sortRewardsByMonthDesc(rewards: readonly AdminReward[]): AdminReward[] {
  return [...rewards].sort((a, b) => (a.month === b.month ? 0 : a.month < b.month ? 1 : -1));
}

// --- Form değerleri + saf doğrulama (istemci sınırları sözleşmeyle birebir) ---

export interface RewardFormValues {
  readonly month: string;
  readonly title: string;
  readonly description: string;
  readonly sponsor: string;
  readonly winnersCount: string;
  readonly cohorts: readonly number[];
  readonly minAssessments: string;
  readonly requirePublicName: boolean;
  readonly termsText: string;
}

export function initialRewardFormValues(month: string): RewardFormValues {
  return {
    cohorts: [...REWARD_COHORTS],
    description: "",
    minAssessments: "0",
    month,
    requirePublicName: true,
    sponsor: "",
    termsText: "",
    title: "",
    winnersCount: "1",
  };
}

export function rewardFormValuesFrom(reward: AdminReward): RewardFormValues {
  return {
    cohorts: reward.eligibility.cohorts,
    description: reward.description,
    minAssessments: String(reward.eligibility.minAssessments),
    month: reward.month,
    requirePublicName: reward.eligibility.requirePublicName,
    sponsor: reward.sponsor,
    termsText: reward.terms.join("\n"),
    title: reward.title,
    winnersCount: String(reward.winnersCount),
  };
}

/** Bir satır bir madde; boş satırlar düşer (E4 ekran maddesi 3). */
export function termsFromText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function toggleCohort(current: readonly number[], cohort: number): number[] {
  return current.includes(cohort) ? current.filter((value) => value !== cohort) : [...current, cohort].sort((a, b) => a - b);
}

export type RewardFieldErrorCode =
  | "monthInvalid"
  | "titleInvalid"
  | "descriptionInvalid"
  | "sponsorInvalid"
  | "winnersCountInvalid"
  | "cohortsRequired"
  | "minAssessmentsInvalid"
  | "termsInvalid";

export type RewardFieldName =
  | "month"
  | "title"
  | "description"
  | "sponsor"
  | "winnersCount"
  | "cohorts"
  | "minAssessments"
  | "terms";

export type RewardFieldErrors = Partial<Record<RewardFieldName, RewardFieldErrorCode>>;

/** Saf doğrulama: `packages/contracts/src/schemas/rewards.ts` sınırlarıyla birebir (başlık ≤160,
 *  açıklama ≤800, sponsor ≤160, kazanan sayısı 1–10, dönem 1–6, en az değerlendirme 0–100, madde ≤300/≤20). */
export function validateRewardForm(values: RewardFormValues): RewardFieldErrors {
  const errors: RewardFieldErrors = {};
  if (!REWARD_MONTH_PATTERN.test(values.month)) errors.month = "monthInvalid";
  const title = values.title.trim();
  if (title.length < 1 || title.length > 160) errors.title = "titleInvalid";
  const description = values.description.trim();
  if (description.length < 1 || description.length > 800) errors.description = "descriptionInvalid";
  const sponsor = values.sponsor.trim();
  if (sponsor.length < 1 || sponsor.length > 160) errors.sponsor = "sponsorInvalid";
  const winnersCount = Number(values.winnersCount);
  if (!Number.isInteger(winnersCount) || winnersCount < 1 || winnersCount > 10) errors.winnersCount = "winnersCountInvalid";
  if (values.cohorts.length < 1 || values.cohorts.length > 6 || new Set(values.cohorts).size !== values.cohorts.length) {
    errors.cohorts = "cohortsRequired";
  }
  const minAssessments = Number(values.minAssessments);
  if (!Number.isInteger(minAssessments) || minAssessments < 0 || minAssessments > 100) errors.minAssessments = "minAssessmentsInvalid";
  const terms = termsFromText(values.termsText);
  if (terms.length > 20 || terms.some((term) => term.length > 300)) errors.terms = "termsInvalid";
  return errors;
}

export function hasRewardFormErrors(errors: RewardFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export function toRewardUpsertRequest(values: RewardFormValues): RewardUpsertRequest {
  return {
    description: values.description.trim(),
    eligibility: {
      cohorts: [...values.cohorts],
      minAssessments: Number(values.minAssessments),
      requirePublicName: values.requirePublicName,
    },
    sponsor: values.sponsor.trim(),
    terms: termsFromText(values.termsText),
    title: values.title.trim(),
    winnersCount: Number(values.winnersCount),
  };
}

// --- Sentetik kaynak (dev) ---

export interface RewardsDataSource {
  list(simId: SimId): Promise<readonly AdminReward[]>;
  /** 409 → `Error("reward_finalized")` (kesinleşmiş ödül düzenlenemez). */
  upsert(simId: SimId, month: string, body: RewardUpsertRequest): Promise<AdminReward>;
  remove(simId: SimId, month: string): Promise<void>;
  /**
   * `currentMonthKey` çağıran (`RewardsPage`) tarafından enjekte edilir
   * (AGENTS.md: `now` bağımlılık, `Date.now()` YOK). 422 → `Error("month_not_closed")`,
   * 409 → `Error("already_finalized")`.
   */
  finalize(simId: SimId, month: string, currentMonthKey: string): Promise<AdminReward>;
}

const NOW_ISO = "2026-09-30T09:00:00.000+03:00" as const;

/** Sentetik, tohumlu `RewardsDataSource`; API bağlanana dek `RewardsPage` bunu kullanır. */
export function createMockRewardsSource(): RewardsDataSource {
  const store = new Map<string, AdminReward>();
  for (const { simId, reward } of REWARD_SEED) {
    const seeded: AdminReward = { ...reward, finalizedAt: null, simId, updatedAt: NOW_ISO, winners: [] };
    store.set(`${simId}:${reward.month}`, seeded);
  }

  function key(simId: SimId, month: string): string {
    return `${simId}:${month}`;
  }

  return {
    async finalize(simId: SimId, month: string, currentMonthKey: string): Promise<AdminReward> {
      const existing = store.get(key(simId, month));
      if (existing === undefined) throw new Error("not_found");
      if (existing.finalizedAt !== null) throw new Error("already_finalized");
      if (!isMonthClosed(month, currentMonthKey)) throw new Error("month_not_closed");
      const finalized: AdminReward = { ...existing, finalizedAt: NOW_ISO };
      store.set(key(simId, month), finalized);
      return finalized;
    },
    async list(simId: SimId): Promise<readonly AdminReward[]> {
      return sortRewardsByMonthDesc([...store.values()].filter((reward) => reward.simId === simId));
    },
    async remove(simId: SimId, month: string): Promise<void> {
      const existing = store.get(key(simId, month));
      if (existing !== undefined && existing.finalizedAt !== null) throw new Error("reward_finalized");
      store.delete(key(simId, month));
    },
    async upsert(simId: SimId, month: string, body: RewardUpsertRequest): Promise<AdminReward> {
      const existing = store.get(key(simId, month));
      if (existing !== undefined && existing.finalizedAt !== null) throw new Error("reward_finalized");
      const next: AdminReward = {
        ...body,
        finalizedAt: null,
        month,
        simId,
        updatedAt: NOW_ISO,
        winners: existing?.winners ?? [],
      };
      store.set(key(simId, month), next);
      return next;
    },
  };
}
