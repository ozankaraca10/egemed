import { ApiError, apiIssueCode, createApiClient, type ApiClient } from "@egemed/api-client";
import type { SimId } from "@egemed/contracts";
import type { SimSessionSource } from "@egemed/sim-host";
import { browserApiWindow, csrfTokenFromCookie } from "../apiAuth";

/**
 * A1.4 (ADR-009): simlere verilen sunucu vaka oturumu kanalı. Uygulama ve
 * değerlendirme vakaları yalnız bu kanaldan gelir; sim cevap anahtarı görmez.
 * API hataları sim sürücüsünün tanıdığı kodlu iletiye çevrilir (ör. `case_time_exceeded`).
 */

/** Sunucu oturumu olan simler: uygulama/değerlendirme vakaları yalnız sunucu kanalından gelir (ADR-009; A1 Ausculta, A2.3 Opaca, A3.3 Pulse). */
export const SERVER_SESSION_SIMS: readonly SimId[] = ["ausculta", "opaca", "pulse"];

function rethrow(error: unknown): never {
  if (error instanceof ApiError) {
    const issue = apiIssueCode(error);
    throw new Error(issue === undefined ? error.code : `${error.code} ${issue}`);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return rethrow(error);
  }
}

function createApiSessionSource(client: Pick<ApiClient, "simSessions" | "challenges">, simId: SimId): SimSessionSource {
  const api = client.simSessions;
  return {
    start: (mode, options) => guarded(async () => (await api.start(simId, mode, options?.focusFinding === undefined ? {} : { focusFinding: options.focusFinding })).data),
    getCase: (sessionId, index) => guarded(async () => (await api.getCase(simId, sessionId, index)).data),
    hint: (sessionId, index, questionId) => guarded(async () => (await api.hint(simId, sessionId, index, questionId)).data),
    check: (sessionId, index, questionId, answer) => guarded(async () => (await api.check(simId, sessionId, index, questionId, answer)).data),
    answer: (sessionId, index, body) => guarded(async () => (await api.answer(simId, sessionId, index, body)).data),
    finish: (sessionId) => guarded(async () => (await api.finish(simId, sessionId)).data),
    audioUrl: (sessionId, token) => api.audioUrl(simId, sessionId, token),
    imageUrl: (sessionId, token) => api.imageUrl(simId, sessionId, token),
    startChallenge: (challengeId) => guarded(async () => (await client.challenges.startSession(challengeId)).data),
  };
}

/** Tarayıcı çerez oturumuyla API kanalı; DOM yoksa `null`. */
export function createBrowserSessionSource(baseUrl: string, simId: SimId): SimSessionSource | null {
  const win = browserApiWindow();
  if (win === null) return null;
  const client = createApiClient({
    baseUrl,
    fetch: (input, init) => win.fetch(input, init),
    readCsrfToken: () => csrfTokenFromCookie(win.document.cookie),
  });
  return createApiSessionSource(client, simId);
}
