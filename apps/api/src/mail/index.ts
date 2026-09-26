/** T170 — sistem e-postası şablonları: dışa açık giriş noktası. */

export { renderAccountCreated, type AccountCreatedData } from "./templates/account-created";
export { renderPasswordReset, type PasswordResetData } from "./templates/password-reset";
export { renderChallengeInvite, type ChallengeInviteData } from "./templates/challenge-invite";
export { renderChallengeResult, type ChallengeResultData } from "./templates/challenge-result";
export {
  renderMonthlyRewardWinner,
  type MonthlyRewardWinnerData,
} from "./templates/monthly-reward-winner";
export {
  renderMonthlySummary,
  type MonthlySummaryData,
  type MonthlySummarySimBlock,
} from "./templates/monthly-summary";
export type { MailRenderResult } from "./types";
