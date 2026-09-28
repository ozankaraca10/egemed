/**
 * A4 (ADR-009) — API oturumunda PUANSIZ öğrenme kaydını sunucuya iletir.
 * Puanlı deneme yolu kapalıdır: uygulama/değerlendirme/düello denemesini sunucu
 * oturumu yazar (`/me/sims/:simId/sessions/:id/finish`). Gövde yalnızca sim ad
 * alanlı `topic` taşır; skor, doğru sayısı, süre veya zaman gönderilmez. XP
 * sunucu kuralından gelir ve konu başına bir kez verilir. `Date.now()`
 * kullanılmaz; kabuk saati yalnız okuma tarafındadır.
 */

import { createApiClient, type ApiClient } from "@egemed/api-client";
import type { GamiCohortFilter, GamiPeriod, LearnWriteRequest, SimId } from "@egemed/contracts";
import type { SimGamificationSource } from "@egemed/sim-host";
import { browserApiWindow, csrfTokenFromCookie } from "./apiAuth";

export interface ReportedLearnActivity {
  /** Sim ad alanlı öğrenme anahtarı (ör. `pulse:mode:af`, `opaca:topic:finding.pleura`). */
  readonly topic: string;
}

/** Rapor hattının gerektirdiği en dar istemci yüzeyi (testler sahte enjekte eder). */
export interface LearnWriteClient {
  readonly gamification: {
    writeLearn(simId: SimId, input: LearnWriteRequest): Promise<unknown>;
  };
}

/** Tek öğrenme kaydı gönderir; hata çağırana aittir (akış bozulmaz). */
export async function reportLearn(
  client: LearnWriteClient,
  simId: SimId,
  activity: ReportedLearnActivity,
): Promise<void> {
  await client.gamification.writeLearn(simId, { topic: activity.topic });
}

function browserClient(baseUrl: string): ApiClient | null {
  const win = browserApiWindow();
  if (win === null) return null;
  return createApiClient({
    baseUrl,
    fetch: (input, init) => win.fetch(input, init),
    readCsrfToken: () => csrfTokenFromCookie(win.document.cookie),
  });
}

/** Tarayıcı çerez oturumuyla öğrenme kaydı gönderir; DOM yoksa `null`. */
export function createBrowserLearnReporter(
  baseUrl: string,
): ((simId: SimId, activity: ReportedLearnActivity) => Promise<void>) | null {
  const client = browserClient(baseUrl);
  if (client === null) return null;
  return (simId, activity) => reportLearn(client, simId, activity);
}

/** API oturumunda İlerlemem okuması; DOM yoksa `null`. */
export function createBrowserGamification(baseUrl: string, simId: SimId): SimGamificationSource | null {
  const client = browserClient(baseUrl);
  if (client === null) return null;
  return {
    async summary() {
      return (await client.gamification.getSummary(simId)).data;
    },
    async leaderboard(period: GamiPeriod, cohort: GamiCohortFilter) {
      return (await client.gamification.getLeaderboard(simId, { period, cohort, page: 1, pageSize: 50 })).data;
    },
  };
}
