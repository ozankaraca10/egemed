/** T253a — aylık ödül kanalı (kabuk `SimRewardsSource`) → React okuma köprüsü.
 *  Sabit katalog yoktur: ödül içeriği ödül yönetiminde (`@egemed/gami-catalogs`
 *  `REWARD_SEED`) tutulur, Opaca'ya yalnız kabuk kanalından gelir. `snapshot()`
 *  ile başlar, `subscribe` ile güncellenir. Kanal aboneliği ilk dinleyiciyle
 *  kurulur, son dinleyici ayrılınca (React unmount) kaldırılır; StrictMode çift
 *  mount'a dayanıklıdır (LearnGate deseni). Kanal yoksa (ziyaretçi, kanalsız
 *  mount) anlık görüntü `null` kalır ve ödül yüzeyleri çizilmez — hata yoktur. */

import type { SimRewardsSnapshot, SimRewardsSource } from "@egemed/sim-host";

interface RewardsTracker {
  /** Son bilinen ödül anlık görüntüsü; kanal yoksa/henüz gelmediyse null. */
  snapshot(): SimRewardsSnapshot | null;
  /** Kanal değişiminde çağrılır; dönüş aboneliği kaldırır. */
  subscribe(listener: () => void): () => void;
}

export function createRewardsTracker(source: SimRewardsSource | undefined): RewardsTracker {
  const listeners = new Set<() => void>();
  let cached: SimRewardsSnapshot | null = source?.snapshot() ?? null;
  let off: (() => void) | null = null;

  return {
    snapshot: () => cached,
    subscribe(listener) {
      listeners.add(listener);
      if (source !== undefined && off === null) {
        off = source.subscribe((next) => {
          cached = next;
          for (const current of [...listeners]) current();
        });
        // Abonelik kurulurken yeni değer gelmiş olabilir; son bilinen tazelenir.
        cached = source.snapshot() ?? cached;
      }
      return () => {
        listeners.delete(listener);
        if (source !== undefined && listeners.size === 0 && off !== null) {
          off();
          off = null;
        }
      };
    },
  };
}
