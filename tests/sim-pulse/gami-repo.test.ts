import { describe, expect, it } from "vitest";
import type { GamiProfile } from "../../packages/gamification-core/src/index";
import { rhythmStreakAfter } from "../../packages/sim-pulse/src/gamification/attempt";
import type { PulseAttemptRecord } from "../../packages/sim-pulse/src/gamification/attempt";
import type { PulseGamiState } from "../../packages/sim-pulse/src/gamification/repo";
import {
  PULSE_GAMI_MAX_ATTEMPTS,
  PULSE_GAMI_STORAGE_KEY,
  computePulseStats,
  createMemoryGamiRepo,
  createStorageGamiRepo,
  emptyPulseGamiState,
  pulseLearnTopic,
} from "../../packages/sim-pulse/src/gamification/repo";

const NOW = new Date("2026-09-24T10:00:00.000Z");

function fakeStorage(options: { throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string): string | null => {
        if (options.throwOnGet) throw new Error("depolama kapalı");
        return values.get(key) ?? null;
      },
      setItem: (key: string, value: string): void => {
        if (options.throwOnSet) throw new Error("kota dolu");
        values.set(key, value);
      },
      removeItem: (key: string): void => { values.delete(key); },
    },
  };
}

const attempt = (overrides: Partial<PulseAttemptRecord> = {}): PulseAttemptRecord => ({
  id: "pulse-assessment-s1",
  mode: "assessment",
  finishedAt: NOW.toISOString(),
  score: 80,
  mastery: true,
  caseCount: 10,
  hintsUsed: 0,
  durationMs: 60_000,
  domains: { rhythmRecognition: 80 },
  extra: {
    ecgMode: "normal",
    modeMastered: true,
    correctlyReadLeads: 6,
    leadCount: 12,
    caliperAccurate: null,
    rhythmRecognitionStreak: 3,
  },
  ...overrides,
});

const stateWith = (attempts: PulseAttemptRecord[]): PulseGamiState => ({ ...emptyPulseGamiState(), attempts });

describe("Pulse oyunlaştırma deposu — bozuk depolama yolları", () => {
  it("depolama yoksa boş durumla başlar ve bellekte yazmaya devam eder", async () => {
    const repo = createStorageGamiRepo(null);
    expect(await repo.load()).toEqual(emptyPulseGamiState());
    const result = await repo.recordAttempt(attempt(), NOW);
    expect(result.state.attempts).toHaveLength(1);
  });

  it("okuma hatası, bozuk JSON ve yanlış sürüm istisna atmadan boş duruma düşer", async () => {
    const cases = [
      fakeStorage({ throwOnGet: true }),
      fakeStorage(),
      fakeStorage(),
      fakeStorage(),
    ];
    cases[1]!.values.set(PULSE_GAMI_STORAGE_KEY, "{bozuk");
    cases[2]!.values.set(PULSE_GAMI_STORAGE_KEY, JSON.stringify({ ...emptyPulseGamiState(), v: 2 }));
    cases[3]!.values.set(PULSE_GAMI_STORAGE_KEY, JSON.stringify({ v: 1, attempts: [] }));
    for (const { storage } of cases) {
      expect(await createStorageGamiRepo(storage).load()).toEqual(emptyPulseGamiState());
    }
  });

  it("eksik/bozuk deneme kayıtlarını düşürür, geçerli olanı korur", async () => {
    const { storage, values } = fakeStorage();
    const good = attempt();
    values.set(PULSE_GAMI_STORAGE_KEY, JSON.stringify({
      ...emptyPulseGamiState(),
      attempts: [good, {}, { id: "", mode: "assessment", finishedAt: NOW.toISOString(), score: 70 }, null],
    }));
    const loaded = await createStorageGamiRepo(storage).load();
    expect(loaded.attempts).toEqual([good]);
  });

  it("yazma hatasında istisna atmaz; kayıt bu oturumda bellekte kalır", async () => {
    const { storage } = fakeStorage({ throwOnSet: true });
    const repo = createStorageGamiRepo(storage);
    const result = await repo.recordAttempt(attempt(), NOW);
    expect(result.state.attempts).toHaveLength(1);
    expect((await repo.load()).attempts).toHaveLength(1);
  });

  it("deneme sayısını sınırlar; en eskiler düşer", async () => {
    const { storage } = fakeStorage();
    const many = Array.from({ length: PULSE_GAMI_MAX_ATTEMPTS + 5 }, (_, i) => attempt({ id: `a${i}` }));
    const loaded = await createStorageGamiRepo(storage, { state: stateWith(many) }).load();
    expect(loaded.attempts).toHaveLength(PULSE_GAMI_MAX_ATTEMPTS);
    expect(loaded.attempts[0]!.id).toBe("a5");
  });
});

describe("Pulse oyunlaştırma deposu — yazma ve rozetler", () => {
  it("recordAttempt idempotenttir; rozetler yeniden verilmez", async () => {
    const repo = createMemoryGamiRepo();
    const record = attempt({ extra: { ...attempt().extra, correctlyReadLeads: 12 } });
    const first = await repo.recordAttempt(record, NOW);
    const second = await repo.recordAttempt(record, NOW);
    expect(first.state.attempts).toHaveLength(1);
    expect(second.state.attempts).toHaveLength(1);
    expect(second.earnedIds).toEqual([]);
    expect(first.earnedIds).toEqual(expect.arrayContaining(["rhythm-streak-3", "twelve-leads", "mode-normal"]));
    expect(second.state.earned.map((e) => e.id)).toEqual(first.state.earned.map((e) => e.id));
  });

  it("kaliper ve mod ustalığı eşiklerini biriktirir", async () => {
    const repo = createMemoryGamiRepo();
    for (let i = 0; i < 3; i += 1) {
      await repo.recordAttempt(attempt({
        id: `pulse-physical-s${i}`,
        finishedAt: new Date(NOW.getTime() + i * 60_000).toISOString(),
        extra: { ...attempt().extra, ecgMode: "af", caliperAccurate: true, correctlyReadLeads: 0, rhythmRecognitionStreak: 0 },
      }), NOW);
    }
    const state = await repo.load();
    expect(state.earned.map((e) => e.id)).toEqual(expect.arrayContaining(["caliper-1", "mode-af"]));
    expect(state.earned.map((e) => e.id)).not.toContain("caliper-2");
  });

  it("kayıtları depolamaya yazar ve yeni örnekten okunur", async () => {
    const { storage, values } = fakeStorage();
    await createStorageGamiRepo(storage).recordAttempt(attempt(), NOW);
    expect(values.has(PULSE_GAMI_STORAGE_KEY)).toBe(true);
    const reloaded = await createStorageGamiRepo(storage).load();
    expect(reloaded.attempts).toHaveLength(1);
    expect(reloaded.earned.length).toBeGreaterThan(0);
  });

  it("recordLearn konuyu bir kez sayar; boş konuyu yok sayar", async () => {
    const repo = createMemoryGamiRepo();
    const topic = pulseLearnTopic("af");
    expect(topic).toContain("af");
    await repo.recordLearn(topic, NOW);
    await repo.recordLearn(topic, NOW);
    await repo.recordLearn("   ", NOW);
    expect((await repo.load()).learn.topics).toEqual([topic]);
  });

  it("updateMe geçersiz alanları yok sayar, adı kırpar", async () => {
    const repo = createMemoryGamiRepo();
    await repo.updateMe({ displayName: "  Selin Çelik  ", public: false, cohort: 5 });
    const me = await repo.updateMe({ cohort: 9, public: "evet" } as unknown as Partial<GamiProfile>);
    expect(me.state.profile).toEqual({ displayName: "Selin Çelik", public: false, cohort: 5 });
  });
});

describe("Pulse oyunlaştırma deposu — liderlik", () => {
  it("dönem puanı en iyi üç değerlendirmenin ortalamasıdır; en az iki deneme şart", async () => {
    const repo = createMemoryGamiRepo({ state: stateWith([
      attempt({ id: "a1", score: 90 }),
      attempt({ id: "a2", score: 80 }),
      attempt({ id: "p1", mode: "practice", score: 100 }),
    ]) });
    const board = await repo.getLeaderboard("month", "all", NOW);
    const me = board.rows.find((row) => row.isMe);
    expect(me?.periodScore).toBe(85);
    expect(me?.attemptsCount).toBe(2);
    expect(me?.rank).not.toBeNull();
    expect(board.isDemo).toBe(true);

    const single = createMemoryGamiRepo({ state: stateWith([attempt()]) });
    expect((await single.getLeaderboard("month", "all", NOW)).rows.find((row) => row.isMe)?.periodScore).toBeNull();
  });

  it("gizli profilde ad sızmaz; satır listelenmez (T295)", async () => {
    const repo = createMemoryGamiRepo({ state: stateWith([attempt(), attempt({ id: "a2", score: 70 })]) });
    await repo.updateMe({ displayName: "Selin Çelik" });
    let board = await repo.getLeaderboard("month", "all", NOW);
    expect(board.rows.find((row) => row.isMe)?.displayName).toBe("Selin Çelik");
    await repo.updateMe({ public: false });
    board = await repo.getLeaderboard("month", "all", NOW);
    expect(board.rows.some((row) => row.isMe)).toBe(false);
    expect(JSON.stringify(board)).not.toContain("Selin");
  });

  it("kohort filtresi yalnız o dönemin satırlarını döner; farklı kohortta 'ben' listede yok", async () => {
    const repo = createMemoryGamiRepo();
    await repo.updateMe({ cohort: 5 });
    const board = await repo.getLeaderboard("week", 1, NOW);
    expect(board.rows.length).toBeGreaterThan(0);
    expect(board.rows.every((row) => row.cohort === 1)).toBe(true);
    expect(board.rows.some((row) => row.isMe)).toBe(false);
  });

  it("demo akran satırları deterministiktir; anonim demo akranı listelenmez", async () => {
    const a = await createMemoryGamiRepo().getLeaderboard("month", "all", NOW);
    const b = await createMemoryGamiRepo().getLeaderboard("month", "all", NOW);
    expect(a.rows).toEqual(b.rows);
    expect(a.rows.some((row) => row.id === "demo-06")).toBe(false);
    expect(a.rows.every((row) => row.isPublic)).toBe(true);
    expect(JSON.stringify(a)).not.toContain("Anonim");
  });
});

describe("ritim serisi taşıma", () => {
  it("doğru yanıt seriyi sürdürür, yanlış sıfırlar; boş dizi seriyi değiştirmez", () => {
    expect(rhythmStreakAfter(0, [true, true, false, true])).toBe(1);
    expect(rhythmStreakAfter(4, [true, true, true])).toBe(7);
    expect(rhythmStreakAfter(4, [false, true])).toBe(1);
    expect(rhythmStreakAfter(3, [])).toBe(3);
  });

  it("geçersiz önceki değeri sıfır sayar", () => {
    expect(rhythmStreakAfter(-2, [true])).toBe(1);
    expect(rhythmStreakAfter(Number.NaN, [true])).toBe(1);
    expect(rhythmStreakAfter(1.5, [true])).toBe(1);
  });
});

describe("Pulse istatistikleri", () => {
  it("seri/derivasyon için en iyiyi, kaliper için toplamı, ustalık için mod kümesini alır", () => {
    const stats = computePulseStats([
      attempt({ id: "a1", extra: { ...attempt().extra, rhythmRecognitionStreak: 3, correctlyReadLeads: 5 } }),
      attempt({ id: "a2", extra: { ...attempt().extra, rhythmRecognitionStreak: 7, correctlyReadLeads: 12, caliperAccurate: true } }),
      attempt({ id: "a3", extra: { ...attempt().extra, ecgMode: "vf", modeMastered: false, caliperAccurate: true } }),
    ]);
    expect(stats).toEqual({
      rhythmRecognitionStreak: 7,
      correctlyReadLeads: 12,
      accurateCaliperCount: 2,
      modeMastery: { normal: 1 },
    });
  });
});
