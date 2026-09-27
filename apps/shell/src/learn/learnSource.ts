import { createApiClient, type ApiClient } from "@egemed/api-client";
import type { LearnStatus, SimId } from "@egemed/contracts";
import type { SimLearnPort } from "@egemed/sim-host";
import { browserApiWindow, csrfTokenFromCookie } from "../apiAuth";

/**
 * Öğrenme tamamlama veri kaynağı (27 Eyl 2026): üç simde de öğrenme modu
 * bitmeden uygulama/değerlendirme ve meydan okuma kilitlidir. API oturumunda
 * `/me/learn` uçları; sahte geliştirme oturumunda kaynak yoktur (kabuk DEV'de
 * `devLocalLearn` ile sekme deposuna yazar).
 */
export interface LearnSource {
  status(): Promise<LearnStatus>;
  complete(simId: SimId, contentVersion: string): Promise<LearnStatus>;
}

export function createApiLearnSource(client: Pick<ApiClient, "learn">): LearnSource {
  return {
    status: async () => (await client.learn.status()).data.sims,
    complete: async (simId, contentVersion) => (await client.learn.complete(simId, contentVersion)).data.sims,
  };
}

/** Tarayıcı çerez oturumuyla API kaynağı; DOM yoksa `null`. */
export function createBrowserLearnSource(baseUrl: string): LearnSource | null {
  const win = browserApiWindow();
  if (win === null) return null;
  const client = createApiClient({
    baseUrl,
    fetch: (input, init) => win.fetch(input, init),
    readCsrfToken: () => csrfTokenFromCookie(win.document.cookie),
  });
  return createApiLearnSource(client);
}

/**
 * Sim modülüne verilen port: başlangıç `complete` değeri kaynaktan okunur,
 * `markComplete` kaynağa yazar ve yerel değeri sunucunun döndürdüğü hâlle
 * günceller.
 */
export async function createLearnPort(source: LearnSource, simId: SimId): Promise<SimLearnPort> {
  let complete = (await source.status())[simId].complete;
  return {
    get complete(): boolean {
      return complete;
    },
    async markComplete(contentVersion: string): Promise<void> {
      complete = (await source.complete(simId, contentVersion))[simId].complete;
    },
  };
}
