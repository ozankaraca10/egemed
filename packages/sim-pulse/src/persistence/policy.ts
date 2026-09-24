import { PULSE_LEGACY_STORAGE_KEYS, PULSE_STORAGE_KEY } from "./types";
import type { PersistencePort, PersistenceResult, PersistenceStorage } from "./types";

export const MAX_PERSISTENCE_BYTES = 4096;
const success = <T>(value: T): PersistenceResult<T> => ({ ok: true, value });
const failure = <T>(code: "storage" | "serialization" | "oversize" | "corrupt", message: string): PersistenceResult<T> => ({ ok: false, code, message });

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function isSupportedRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const version = (value as { version?: unknown }).version;
  return Number.isInteger(version) && (version as number) >= 1 && (version as number) <= 6;
}

/** Adds Pulse's size and unreadable-record write protection to a storage adapter. */
export function withPersistencePolicy(
  storage: PersistenceStorage,
  key = PULSE_STORAGE_KEY,
  legacyKeys: readonly string[] = PULSE_LEGACY_STORAGE_KEYS,
): PersistencePort {
  let writesAllowed = true;

  return {
    load() {
      let raw: string | null;
      try {
        raw = storage.getItem(key);
        if (!raw) {
          for (const legacyKey of legacyKeys) {
            raw = storage.getItem(legacyKey);
            if (raw) break;
          }
        }
      } catch {
        writesAllowed = false;
        return failure("storage", "Pulse devam kaydı okunamadı; önceki veri korundu");
      }
      if (!raw) {
        writesAllowed = true;
        return success(null);
      }
      if (utf8ByteLength(raw) > MAX_PERSISTENCE_BYTES) {
        writesAllowed = false;
        return failure("oversize", "Pulse devam kaydı 4096 bayt sınırını aşıyor; önceki veri korundu");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        writesAllowed = false;
        return failure("corrupt", "Pulse devam kaydı bozuk JSON; önceki veri korundu");
      }
      if (!isSupportedRecord(parsed)) {
        writesAllowed = false;
        return failure("corrupt", "Pulse devam kaydı sürümü veya biçimi desteklenmiyor; önceki veri korundu");
      }
      writesAllowed = true;
      return success(parsed);
    },

    save(value) {
      if (!writesAllowed) return failure("corrupt", "Önce Pulse devam kaydını temizleyin veya yeniden yükleyin");
      let serialized: string;
      try {
        const result = JSON.stringify(value);
        if (result === undefined) return failure("serialization", "Pulse devam kaydı JSON'a dönüştürülemedi");
        serialized = result;
      } catch {
        return failure("serialization", "Pulse devam kaydı JSON'a dönüştürülemedi");
      }
      if (utf8ByteLength(serialized) > MAX_PERSISTENCE_BYTES) {
        return failure("oversize", "Pulse devam kaydı 4096 bayt sınırını aşıyor");
      }
      try {
        storage.setItem(key, serialized);
        return success(undefined);
      } catch {
        return failure("storage", "Tarayıcı Pulse devam kaydını yazmayı reddetti");
      }
    },

    clear() {
      try {
        storage.removeItem(key);
        for (const legacyKey of legacyKeys) storage.removeItem(legacyKey);
        writesAllowed = true;
        return success(undefined);
      } catch {
        writesAllowed = false;
        return failure("storage", "Pulse devam kaydı temizlenemedi");
      }
    },
  };
}
