import { describe, expect, it } from "vitest";
import {
  FS_PROMPT_KEY,
  loadFsPromptDone,
  saveFsPromptDone,
} from "../../../packages/sim-opaca/src/index";
import type { StoragePort } from "../../../packages/sim-opaca/src/index";

function memoryStorage(seed: Record<string, string> = {}): StoragePort {
  const entries = new Map(Object.entries(seed));
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

describe("fsPromptDone deposu (StoragePort)", () => {
  it("opaca.fsPromptDone anahtarı bellek deposunda okunur/yazılır", () => {
    const storage = memoryStorage();
    expect(FS_PROMPT_KEY).toBe("opaca.fsPromptDone");
    expect(loadFsPromptDone(storage)).toBe(false);
    saveFsPromptDone(storage);
    expect(storage.get(FS_PROMPT_KEY)).toBe("1");
    expect(loadFsPromptDone(storage)).toBe(true);
  });

  it("erişim engelinde sessizce yutulur", () => {
    const broken: StoragePort = {
      get() {
        throw new Error("erişim engelli");
      },
      set() {
        throw new Error("erişim engelli");
      },
    };
    expect(loadFsPromptDone(broken)).toBe(false);
    expect(() => saveFsPromptDone(broken)).not.toThrow();
  });
});
