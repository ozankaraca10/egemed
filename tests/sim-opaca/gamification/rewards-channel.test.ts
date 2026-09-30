import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import type { SimRewardsSnapshot, SimRewardsSource } from "../../../packages/sim-host/src/SimHost";
import type { MonthlyReward } from "../../../packages/gamification-core/src/types";
import { GamiProvider } from "../../../packages/sim-opaca/src/gamification/GamiContext";
import { createRewardsTracker } from "../../../packages/sim-opaca/src/gamification/rewardsChannel";
import { StoreProvider, createMemoryRuntimeAdapter } from "../../../packages/sim-opaca/src/index";
import { LeaderboardScreen } from "../../../packages/sim-opaca/src/screens/LeaderboardScreen";
import { ModeSelectScreen } from "../../../packages/sim-opaca/src/screens/ModeSelectScreen";
import type { StoragePort, WindowLike } from "../../../packages/sim-opaca/src/index";

/** T253a — aylık ödül yalnız kabuk kanalından (`SimRewardsSource`) okunur.
 *  Sabit katalog/uydurma kazanan geçmişi Opaca'da yoktur; kanal yoksa ödül yüzeyi çizilmez. */

const NOW = Date.UTC(2026, 8, 15, 9);

const REWARD: MonthlyReward = {
  month: "2026-09",
  title: "Kanal ödülü: toraks BT raporlama oturumuna katılım",
  description: "Ayın ilk 3'ü, Radyoloji AD öğretim üyesi eşliğinde bir BT raporlama oturumuna konuk olur.",
  sponsor: "Radyoloji Anabilim Dalı",
  winnersCount: 3,
  eligibility: { cohorts: [1, 2, 3, 4, 5, 6], minAssessments: 4, requirePublicName: true },
  terms: ["Uygun kohortlar: Dönem 1–6 öğrencileri."],
};

const SNAPSHOT: SimRewardsSnapshot = {
  current: REWARD,
  winners: [
    { month: "2026-08", rank: 1, displayName: "Zehra Uçar", score: 94.1, isMe: false },
    { month: "2026-08", rank: 2, displayName: "Ozan Bilir", score: 92.4, isMe: false },
  ],
};

interface FakeRewardsSource extends SimRewardsSource {
  emit(next: SimRewardsSnapshot): void;
  listenerCount(): number;
}

function fakeRewardsSource(initial: SimRewardsSnapshot): FakeRewardsSource {
  let current = initial;
  const listeners = new Set<(snapshot: SimRewardsSnapshot) => void>();
  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit(next) {
      current = next;
      for (const listener of [...listeners]) listener(next);
    },
    listenerCount: () => listeners.size,
  };
}

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function memoryStorage(): StoragePort {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

function renderWithChannel(node: ReactNode, rewards?: SimRewardsSource): string {
  return renderToStaticMarkup(
    createElement(GamiProvider, {
      now: () => NOW,
      ...(rewards === undefined ? {} : { rewards }),
      children: createElement(StoreProvider, {
        children: node,
        env: inertWindow,
        now: () => NOW,
        runtime: createMemoryRuntimeAdapter(),
        storage: memoryStorage(),
      }),
    }),
  );
}

describe("ödül kanalı köprüsü (createRewardsTracker)", () => {
  it("snapshot ile başlar; subscribe ile gelen yeni başlık aboneye iletilir", () => {
    const source = fakeRewardsSource(SNAPSHOT);
    const tracker = createRewardsTracker(source);
    expect(tracker.snapshot()).toBe(SNAPSHOT);

    const seen: (SimRewardsSnapshot | null)[] = [];
    const off = tracker.subscribe(() => seen.push(tracker.snapshot()));
    source.emit({ ...SNAPSHOT, current: { ...REWARD, title: "Kanal ödülü: güncellenen başlık" } });

    expect(seen.at(-1)?.current?.title).toBe("Kanal ödülü: güncellenen başlık");
    expect(tracker.snapshot()?.current?.title).toBe("Kanal ödülü: güncellenen başlık");

    off();
    source.emit({ ...SNAPSHOT, current: { ...REWARD, title: "Abonelik sonrası" } });
    expect(seen).toHaveLength(1);
  });

  it("kanal aboneliği yalnız dinleyici varken kurulur; son dinleyici ayrılınca kaldırılır", () => {
    const source = fakeRewardsSource(SNAPSHOT);
    const tracker = createRewardsTracker(source);
    expect(source.listenerCount()).toBe(0);
    const off = tracker.subscribe(() => undefined);
    expect(source.listenerCount()).toBe(1);
    off();
    expect(source.listenerCount()).toBe(0);
  });

  it("kanal yoksa anlık görüntü boş kalır", () => {
    expect(createRewardsTracker(undefined).snapshot()).toBeNull();
  });
});

describe("ödül kanalının yüzeylere taşınması (statik render)", () => {
  it("kanal verildiğinde liderlikte ödül başlığı ve kazanan geçmişi çizilir", () => {
    const html = renderWithChannel(createElement(LeaderboardScreen), fakeRewardsSource(SNAPSHOT));
    expect(html).toContain(REWARD.title);
    expect(html).toContain("Önceki ayların kazananları");
    expect(html).toContain("Zehra Uçar");
    expect(html).toContain("Ozan Bilir");
  });

  it("kanal verildiğinde başlangıç ekranında ödül satırı çizilir", () => {
    const html = renderWithChannel(
      createElement(ModeSelectScreen, { embedded: true, gamiEnabled: true }),
      fakeRewardsSource(SNAPSHOT),
    );
    expect(html).toContain("Bu ayın ödülü");
  });

  it("kanal yokken ödül bandı/satırı ve kazanan geçmişi çizilmez", () => {
    const leaderboard = renderWithChannel(createElement(LeaderboardScreen));
    expect(leaderboard).not.toContain("eg-gami-reward");
    expect(leaderboard).not.toContain("Önceki ayların kazananları");
    const modes = renderWithChannel(createElement(ModeSelectScreen, { embedded: true, gamiEnabled: true }));
    expect(modes).not.toContain("Bu ayın ödülü");
  });
});

describe("sabit ödül kataloğu kalıntısı (kaynak denetimi)", () => {
  const FORBIDDEN_IDENTIFIERS = ["MONTHLY_REWARDS", "REWARD_WINNERS_HISTORY", "SEPTEMBER_2026"];

  it("Opaca kaynaklarında sabit ödül kataloğu ve uydurma kazanan geçmişi kalmaz", () => {
    const files = ts.sys.readDirectory("packages/sim-opaca/src", [".ts", ".tsx"], ["**/node_modules/**"]);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = ts.sys.readFile(file) ?? "";
      for (const needle of FORBIDDEN_IDENTIFIERS) {
        expect(source.includes(needle), `${file} içinde ${needle}`).toBe(false);
      }
    }
  });
});
