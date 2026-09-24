import { createAudioEngine } from "./engine";
import type { AudioEngine, AudioEngineDeps } from "./engine";

/** Kaynak `engineSingleton` yerine mount başına motor. Modül düzeyinde örnek yok. */
export function createEngine(deps: AudioEngineDeps): AudioEngine {
  return createAudioEngine(deps);
}

export type { AudioEngine, AudioEngineDeps };
