import { withPersistencePolicy } from "./policy";
import type { PersistencePort, PersistenceStorage } from "./types";

/** Uses a caller-provided localStorage-compatible object; never reads globals. */
export function createLocalStoragePersistence(storage: PersistenceStorage): PersistencePort {
  return withPersistencePolicy(storage);
}
