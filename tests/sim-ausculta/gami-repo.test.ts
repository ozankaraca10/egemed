import { beforeEach, describe, expect, it } from "vitest";
import {
  AUSCULTA_GAMI_STORAGE_KEY,
  LocalGamiRepository,
  type GamiStorage,
} from "../../packages/sim-ausculta/src/gamification/repo";

class MemoryStorage implements GamiStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const at = new Date("2026-09-24T10:00:00.000Z");
let storage: MemoryStorage;
let repo: LocalGamiRepository;
beforeEach(() => {
  storage = new MemoryStorage();
  repo = new LocalGamiRepository({ storage, now: () => at });
});

describe("Ausculta oyunlaştırma deposu", () => {
  it("değerlendirme olaylarını yerel kaydeder ve yineleneni saymaz", () => {
    const event = {
      type: "case_completed" as const, id: "vaka:1", finishedAt: at.toISOString(), mode: "assessment" as const,
      score: 84, mastery: true, hintsUsed: 0, domains: { diagnosis: 100 },
    };
    repo.recordEvent(event);
    repo.recordEvent(event);
    expect(repo.snapshot().attempts).toHaveLength(1);
    expect(repo.snapshot().attempts[0]).toMatchObject({ score: 84, mode: "assessment", caseCount: 1 });
    expect(storage.getItem(AUSCULTA_GAMI_STORAGE_KEY)).toContain("vaka:1");
  });

  it("doğru tanı rozet ilerlemesini artırır ve aboneleri bilgilendirir", () => {
    let updates = 0;
    repo.subscribe(() => { updates++; });
    for (let index = 0; index < 3; index++) {
      repo.recordEvent({ type: "correct_diagnosis", id: `tanı:${index}`, finishedAt: at.toISOString() });
    }
    expect(repo.snapshot().stats.correctDiagnosisCount).toBe(3);
    expect(repo.snapshot().earned.map((badge) => badge.id)).toContain("diagnosis-3");
    expect(updates).toBe(3);
  });

  it("bozuk veya isim/e-posta içeren yükleri UI profiline taşımaz", () => {
    storage.values.set(AUSCULTA_GAMI_STORAGE_KEY, "{broken");
    const fresh = new LocalGamiRepository({ storage, now: () => at });
    expect(fresh.snapshot().attempts).toEqual([]);
    expect(JSON.stringify(fresh.snapshot())).not.toMatch(/name|email|@/i);
  });
});
