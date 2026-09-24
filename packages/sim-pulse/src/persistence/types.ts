export const PULSE_STORAGE_KEY = "egemed-pulse-6.0";
export const PULSE_LEGACY_STORAGE_KEYS = [
  "egemed-pulse-5.0",
  "egemed-cardai-4.0",
  "egemed-cardai-3.0",
  "egemed-cardai-2.0",
  "egemed-cardai-1.0",
] as const;

export interface PersistencePort {
  load(): PersistenceResult<unknown | null>;
  save(value: unknown): PersistenceResult<void>;
  clear(): PersistenceResult<void>;
}

export type PersistenceErrorCode = "storage" | "serialization" | "oversize" | "corrupt";
export type PersistenceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: PersistenceErrorCode; message: string };

/** Minimal Storage-compatible shape; it does not require browser DOM types. */
export interface PersistenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
