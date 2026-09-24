import { describe, expect, it } from "vitest";
import {
  LANDING_SOUND_PREFERENCE_KEY,
  createPulseLandingContent,
  createPulseLandingController,
  type AudioPort,
  type LandingPreferencePersistencePort,
} from "../../packages/sim-pulse/src/index";

function fakeAudio(unlockResult = true): AudioPort & {
  calls: { unlock: number; start: number; stop: number; close: number };
} {
  const calls = { unlock: 0, start: 0, stop: 0, close: 0 };
  return {
    calls,
    async unlock() {
      calls.unlock += 1;
      return unlockResult;
    },
    start() {
      calls.start += 1;
    },
    stop() {
      calls.stop += 1;
    },
    async close() {
      calls.close += 1;
    },
  };
}

function fakePersistence(initial: unknown): LandingPreferencePersistencePort & {
  readonly store: { value: unknown };
  readonly saves: unknown[];
} {
  const store = { value: initial };
  const saves: unknown[] = [];
  return {
    store,
    saves,
    load: () => ({ ok: true, value: store.value }),
    save: (value) => {
      saves.push(value);
      store.value = value;
      return { ok: true, value: undefined };
    },
  };
}

describe("Pulse landing modeli", () => {
  it("standalone içerikte kaynak lead/feature metinlerini üretir; embedded modda atlar", () => {
    expect(createPulseLandingContent({
      variant: "embedded",
      counts: { modeCount: 13, caseCount: 200, questionCount: 200 },
    })).toBeNull();

    const content = createPulseLandingContent({
      variant: "standalone",
      counts: { modeCount: 13, caseCount: 200, questionCount: 200 },
    });
    expect(content).not.toBeNull();
    expect(content?.lead).toBe(
      "13 sentetik EKG sonucu, 12 derivasyon, 200 vaka ve 200 değerlendirme maddesi. Her oturumda rastgele 10 vaka ve 10 soru.",
    );
    expect(content?.features.map((item) => item.title)).toEqual([
      "13 sentetik EKG sonucu",
      "200 vaka · 200 soru",
      "SCORM 1.2",
    ]);
  });

  it("ses tercihini PersistencePort'tan okuyup toggle ile kaydeder ve monitor sync eder", async () => {
    const persistence = fakePersistence({
      version: 6,
      mode: "normal",
      [LANDING_SOUND_PREFERENCE_KEY]: "0",
    });
    const audio = fakeAudio(true);
    const landing = createPulseLandingController({
      variant: "standalone",
      counts: { modeCount: 13, caseCount: 200, questionCount: 200 },
      audio,
      persistence,
    });

    expect(landing.isSoundEnabled()).toBe(false);
    await expect(landing.toggleSound()).resolves.toBe(true);
    expect(audio.calls.unlock).toBe(1);
    expect(audio.calls.start).toBe(1);
    expect(persistence.saves.at(-1)).toMatchObject({
      version: 6,
      mode: "normal",
      [LANDING_SOUND_PREFERENCE_KEY]: "1",
    });
  });

  it("visibility, enter/return ve dispose akışında start/stop/close çağrılarını temiz yönetir", async () => {
    const persistence = fakePersistence({ [LANDING_SOUND_PREFERENCE_KEY]: "1" });
    const audio = fakeAudio(true);
    const landing = createPulseLandingController({
      variant: "standalone",
      counts: { modeCount: 13, caseCount: 200, questionCount: 200 },
      audio,
      persistence,
      initialDocumentHidden: true,
    });

    await landing.unlockAudio();
    expect(audio.calls.start).toBe(0);
    landing.setDocumentHidden(false);
    expect(audio.calls.start).toBe(1);
    landing.enterSimulator();
    expect(audio.calls.stop).toBeGreaterThan(0);
    landing.showLanding();
    expect(audio.calls.start).toBe(2);

    await landing.dispose();
    await landing.dispose();
    expect(audio.calls.close).toBe(1);
  });
});
