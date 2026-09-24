/** `localStorage` okuma/yazma sınırı — storage/repo istisnası.
 *  Mount'ta `bindGamiStorage` ile ad alanlı `StoragePort` bağlanır (T93);
 *  bağ yoksa kaynak davranışı (doğrudan `localStorage`) geçerlidir. */

import type { GamiStateV1 } from "@egemed/gamification-core";
import type { StoragePort } from "../core/reducer";
import { localStorageLike } from "../platform-dom";
import { OPACA_RULES } from "./rules";
import type { OpacaAttemptRecord } from "./attempt";

export type OpacaGamiState = GamiStateV1<string, OpacaAttemptRecord["extra"]>;

export const STORAGE_KEY = OPACA_RULES.storage.key;

/** Mount ad alanı portu; null → kaynak `localStorage` yüzeyi. */
let activePort: StoragePort | null = null;

/** SimModule mount: oyunlaştırma kayıtlarını actorId ad alanına bağlar; dispose null geçer. */
export function bindGamiStorage(port: StoragePort | null): void {
  activePort = port;
}

function readRaw(): string | null {
  if (activePort !== null) return activePort.get(STORAGE_KEY);
  return localStorageLike()?.getItem(STORAGE_KEY) ?? null;
}

function writeRaw(value: string): void {
  if (activePort !== null) {
    activePort.set(STORAGE_KEY, value);
    return;
  }
  localStorageLike()?.setItem(STORAGE_KEY, value);
}

export function emptyState(): OpacaGamiState {
  return {
    v: 1,
    attempts: [],
    learn: { topics: [], items: {} },
    earned: [],
    profile: { displayName: null, public: true, cohort: null },
  };
}

function isValidState(x: unknown): x is OpacaGamiState {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  if (s.v !== 1) return false;
  if (!Array.isArray(s.attempts) || !Array.isArray(s.earned)) return false;
  if (!s.learn || typeof s.learn !== "object") return false;
  if (!s.profile || typeof s.profile !== "object") return false;
  const learn = s.learn as Record<string, unknown>;
  if (!Array.isArray(learn.topics)) return false;
  if (!learn.items || typeof learn.items !== "object") return false;
  return true;
}

export function loadState(): OpacaGamiState {
  try {
    const raw = readRaw();
    if (!raw) return emptyState();
    const parsed: unknown = JSON.parse(raw);
    if (!isValidState(parsed)) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

export function saveState(state: OpacaGamiState): void {
  try {
    const trimmed: OpacaGamiState = {
      ...state,
      attempts:
        state.attempts.length > OPACA_RULES.storage.maxAttempts
          ? state.attempts.slice(state.attempts.length - OPACA_RULES.storage.maxAttempts)
          : state.attempts,
    };
    writeRaw(JSON.stringify(trimmed));
  } catch {
    // sessizce yok say
  }
}
