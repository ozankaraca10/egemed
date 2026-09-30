import type { ApiClient } from "@egemed/api-client";
import type { SimId } from "@egemed/contracts";
import type { MonthlyReward, RewardWinner } from "@egemed/gamification-core";
import type { SimRewardsSnapshot, SimRewardsSource } from "@egemed/sim-host";
import type { RewardsDataSource } from "../admin/rewardsDataSource";

export interface RewardStore {
  forSim(simId: SimId): SimRewardsSource;
  invalidate(): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

interface RewardStoreOptions {
  readonly rewards: RewardsDataSource;
  readonly client?: Pick<ApiClient, "rewards">;
  readonly now: () => number;
}

function monthKey(now: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit" }).formatToParts(new Date(now));
  return `${parts.find((part) => part.type === "year")?.value ?? "1970"}-${parts.find((part) => part.type === "month")?.value ?? "01"}`;
}

function sameSnapshot(left: SimRewardsSnapshot | null, right: SimRewardsSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createRewardStore({ rewards, client, now }: RewardStoreOptions): RewardStore {
  const current = new Map<SimId, SimRewardsSnapshot | null>();
  const simListeners = new Map<SimId, Set<(snapshot: SimRewardsSnapshot) => void>>();
  const listeners = new Set<() => void>();
  const ports = new Map<SimId, SimRewardsSource>();
  const browser = globalThis as typeof globalThis & {
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
    document?: { visibilityState: string; addEventListener(type: string, listener: () => void): void; removeEventListener(type: string, listener: () => void): void };
    BroadcastChannel?: new (name: string) => { postMessage(value: unknown): void; addEventListener(type: string, listener: (event: { data: unknown }) => void): void; removeEventListener(type: string, listener: (event: { data: unknown }) => void): void; close(): void };
    setInterval?: typeof setInterval;
    clearInterval?: typeof clearInterval;
  };
  const channel = browser.BroadcastChannel === undefined ? null : new browser.BroadcastChannel("egemed-rewards");
  let disposed = false;
  let polling: ReturnType<typeof setInterval> | null = null;

  async function read(simId: SimId): Promise<SimRewardsSnapshot> {
    if (client !== undefined) {
      const result = await client.rewards.getMySimReward(simId);
      return result.data as unknown as SimRewardsSnapshot;
    }
    const month = monthKey(now());
    const rows = await rewards.list(simId);
    const selected = rows.find((reward) => reward.month === month) ?? [...rows].filter((reward) => reward.month < month).sort((a, b) => (a.month < b.month ? 1 : -1))[0];
    const reward = selected === undefined ? null : { ...selected, month } as unknown as MonthlyReward;
    const winners: RewardWinner[] = rows
      .filter((row) => row.finalizedAt !== null && row.month < month)
      .sort((a, b) => (a.month < b.month ? 1 : -1))
      .flatMap((row) => row.winners);
    return { current: reward, winners };
  }

  async function refresh(announce: boolean): Promise<void> {
    const changed: SimId[] = [];
    await Promise.all(((["pulse", "ausculta", "opaca"] as const).map(async (simId) => {
      try {
        const next = await read(simId);
        const previous = current.get(simId) ?? null;
        if (!current.has(simId) || !sameSnapshot(previous, next)) {
          current.set(simId, next);
          changed.push(simId);
        }
      } catch {
        // A geçici okuma hatası son iyi görüntüyü korur; sonraki yenileme tekrar dener.
      }
    })));
    if (changed.length === 0 || disposed) return;
    for (const simId of changed) {
      for (const listener of simListeners.get(simId) ?? []) listener(current.get(simId) as SimRewardsSnapshot);
    }
    for (const listener of listeners) listener();
    if (announce) channel?.postMessage({ type: "changed" });
  }

  const onChannelMessage = (event: { data: unknown }) => {
    if (typeof event.data === "object" && event.data !== null && "type" in event.data && event.data.type === "changed") void refresh(false);
  };
  const onFocus = () => void refresh(false);
  const onVisibility = () => {
    if (browser.document?.visibilityState === "visible") void refresh(false);
  };

  channel?.addEventListener("message", onChannelMessage);
  if (client !== undefined) {
    browser.addEventListener?.("focus", onFocus);
    browser.document?.addEventListener("visibilitychange", onVisibility);
    polling = browser.setInterval?.(() => void refresh(false), 60_000) ?? null;
  }
  void refresh(false);

  return {
    forSim(simId): SimRewardsSource {
      let port = ports.get(simId);
      if (port === undefined) {
        port = {
          snapshot: () => current.get(simId) ?? null,
          subscribe(listener) {
            const subscribers = simListeners.get(simId) ?? new Set();
            subscribers.add(listener);
            simListeners.set(simId, subscribers);
            return () => subscribers.delete(listener);
          },
        };
        ports.set(simId, port);
      }
      return port;
    },
    async invalidate() {
      await refresh(true);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      channel?.removeEventListener("message", onChannelMessage);
      channel?.close();
      browser.removeEventListener?.("focus", onFocus);
      browser.document?.removeEventListener("visibilitychange", onVisibility);
      if (polling !== null) browser.clearInterval?.(polling);
      listeners.clear();
      simListeners.clear();
    },
  };
}
