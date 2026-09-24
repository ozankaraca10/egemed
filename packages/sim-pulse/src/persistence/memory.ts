import { withPersistencePolicy } from "./policy";
import type { PersistencePort, PersistenceStorage } from "./types";

/** In-memory adapter useful for isolated sessions and tests. */
export function createMemoryPersistence(initial: Readonly<Record<string, string>> = {}): PersistencePort {
  const values = new Map(Object.entries(initial));
  const storage: PersistenceStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return withPersistencePolicy(storage);
}
