import type { AudioPort } from "../audio/monitor";

export const LANDING_SOUND_PREFERENCE_KEY = "pulse.landingSound";

export type PulseLandingVariant = "standalone" | "embedded";

export interface PulseLandingCounts {
  readonly modeCount: number;
  readonly caseCount: number;
  readonly questionCount: number;
}

export interface PulseLandingFeature {
  readonly title: string;
  readonly description: string;
}

export interface PulseLandingContent {
  readonly lead: string;
  readonly features: readonly PulseLandingFeature[];
}

export interface CreatePulseLandingContentOptions {
  readonly variant: PulseLandingVariant;
  readonly counts: PulseLandingCounts;
}

export type LandingPersistenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export interface LandingPreferencePersistencePort {
  load(): LandingPersistenceResult<unknown | null>;
  save(value: unknown): LandingPersistenceResult<void>;
}

export interface PulseLandingController {
  readonly content: PulseLandingContent | null;
  isSoundEnabled(): boolean;
  showLanding(): void;
  enterSimulator(): void;
  setDocumentHidden(hidden: boolean): void;
  unlockAudio(): Promise<boolean>;
  toggleSound(): Promise<boolean>;
  dispose(): Promise<void>;
}

export interface CreatePulseLandingControllerOptions extends CreatePulseLandingContentOptions {
  readonly audio: AudioPort;
  readonly persistence: LandingPreferencePersistencePort;
  readonly initialDocumentHidden?: boolean;
}

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function soundValueFromRecord(record: Record<string, unknown>): boolean {
  const value = record[LANDING_SOUND_PREFERENCE_KEY];
  if (typeof value === "string") return value !== "0";
  if (typeof value === "number") return value !== 0;
  if (typeof value === "boolean") return value;
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSoundPreference(persistence: LandingPreferencePersistencePort): boolean {
  const loaded = persistence.load();
  if (!loaded.ok || !isRecord(loaded.value)) return true;
  return soundValueFromRecord(loaded.value);
}

function saveSoundPreference(persistence: LandingPreferencePersistencePort, enabled: boolean): void {
  const loaded = persistence.load();
  const current = loaded.ok && isRecord(loaded.value) ? loaded.value : {};
  void persistence.save({
    ...current,
    [LANDING_SOUND_PREFERENCE_KEY]: enabled ? "1" : "0",
  });
}

export function createPulseLandingContent(options: CreatePulseLandingContentOptions): PulseLandingContent | null {
  if (options.variant === "embedded") return null;
  const modeCount = clampCount(options.counts.modeCount);
  const caseCount = clampCount(options.counts.caseCount);
  const questionCount = clampCount(options.counts.questionCount);
  return {
    lead: `${modeCount} sentetik EKG sonucu, 12 derivasyon, ${caseCount} vaka ve ${questionCount} değerlendirme maddesi. Her oturumda rastgele 10 vaka ve 10 soru.`,
    features: [
      {
        title: `${modeCount} sentetik EKG sonucu`,
        description: "12 derivasyon; Kardiyoloji Anabilim Dalı öğretim üyelerince valide edilmiştir.",
      },
      {
        title: `${caseCount} vaka · ${questionCount} soru`,
        description: "Her oturumda rastgele 10 vaka ve 10 soru.",
      },
      {
        title: "SCORM 1.2",
        description: "Puan ve durum LMS’e raporlanır.",
      },
    ],
  };
}

export function createPulseLandingController(options: CreatePulseLandingControllerOptions): PulseLandingController {
  const content = createPulseLandingContent(options);
  let soundEnabled = readSoundPreference(options.persistence);
  let documentHidden = options.initialDocumentHidden ?? false;
  let landingVisible = options.variant === "standalone";
  let disposed = false;

  const syncAudio = (): void => {
    if (disposed) return;
    if (documentHidden || !landingVisible || !soundEnabled) {
      options.audio.stop();
      return;
    }
    options.audio.start();
  };

  const unlockAudio = async (): Promise<boolean> => {
    if (disposed || !soundEnabled) return false;
    let unlocked = false;
    try {
      unlocked = await options.audio.unlock();
    } catch {
      unlocked = false;
    }
    if (unlocked) syncAudio();
    return unlocked;
  };

  const toggleSound = async (): Promise<boolean> => {
    if (disposed) return soundEnabled;
    soundEnabled = !soundEnabled;
    saveSoundPreference(options.persistence, soundEnabled);
    if (!soundEnabled) {
      options.audio.stop();
      return false;
    }
    await unlockAudio();
    return true;
  };

  syncAudio();

  return {
    content,
    isSoundEnabled(): boolean {
      return soundEnabled;
    },
    showLanding(): void {
      landingVisible = true;
      syncAudio();
    },
    enterSimulator(): void {
      landingVisible = false;
      options.audio.stop();
    },
    setDocumentHidden(hidden: boolean): void {
      documentHidden = hidden;
      syncAudio();
    },
    unlockAudio,
    toggleSound,
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      options.audio.stop();
      await options.audio.close();
    },
  };
}
