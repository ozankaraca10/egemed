/** `localStorage` okuma/yazma sınırı — storage/repo istisnası. */

import type { GamiStateV1 } from "@egemed/gamification-core";
import { localStorageLike } from "../platform-dom";
import { OPACA_RULES } from "./rules";
import type { OpacaAttemptRecord } from "./attempt";

export type OpacaGamiState = GamiStateV1<string, OpacaAttemptRecord["extra"]>;

export const STORAGE_KEY = OPACA_RULES.storage.key;

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
    const storage = localStorageLike();
    if (!storage) return emptyState();
    const raw = storage.getItem(STORAGE_KEY);
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
    const storage = localStorageLike();
    if (!storage) return;
    const trimmed: OpacaGamiState = {
      ...state,
      attempts:
        state.attempts.length > OPACA_RULES.storage.maxAttempts
          ? state.attempts.slice(state.attempts.length - OPACA_RULES.storage.maxAttempts)
          : state.attempts,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // sessizce yok say
  }
}
