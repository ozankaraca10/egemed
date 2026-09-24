import { describe, expect, it } from "vitest";
import {
  createLocalStoragePersistence,
  createMemoryPersistence,
  MAX_PERSISTENCE_BYTES,
  PULSE_LEGACY_STORAGE_KEYS,
  PULSE_STORAGE_KEY,
  utf8ByteLength,
} from "../../packages/sim-pulse/src/index";
import type { PersistenceStorage } from "../../packages/sim-pulse/src/index";

function fakeStorage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  const storage: PersistenceStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { storage, values };
}

describe("Pulse kalıcılık portu", () => {
  it("kayıtları injected localStorage'a yazar ve aynı değeri geri yükler", () => {
    const { storage, values } = fakeStorage();
    const persistence = createLocalStoragePersistence(storage);
    const state = { version: 6, mode: "normal", answer: 3 };

    expect(persistence.load()).toEqual({ ok: true, value: null });
    expect(persistence.save(state)).toEqual({ ok: true, value: undefined });
    expect(values.get(PULSE_STORAGE_KEY)).toBe(JSON.stringify(state));
    expect(persistence.load()).toEqual({ ok: true, value: state });
  });

  it("4096 UTF-8 bayt sınırını uygular ve kayıt kesmez", () => {
    const { storage, values } = fakeStorage({ [PULSE_STORAGE_KEY]: '{"version":6,"saved":"old"}' });
    const persistence = createLocalStoragePersistence(storage);

    expect(utf8ByteLength("ö")).toBe(2);
    expect(persistence.save({ version: 6, padding: "ö".repeat(2048) })).toMatchObject({ ok: false, code: "oversize" });
    expect(values.get(PULSE_STORAGE_KEY)).toBe('{"version":6,"saved":"old"}');
    expect(MAX_PERSISTENCE_BYTES).toBe(4096);
  });

  it.each([
    ["bozuk JSON", "{invalid"],
    ["desteklenmeyen sürüm", '{"version":9,"saved":"future"}'],
    ["nesne olmayan kayıt", "[]"],
  ])("%s mevcutken üzerine yazmayı engeller, clear sonrası izin verir", (_name, raw) => {
    const { storage, values } = fakeStorage({ [PULSE_STORAGE_KEY]: raw });
    const persistence = createLocalStoragePersistence(storage);

    expect(persistence.load()).toMatchObject({ ok: false });
    expect(persistence.save({ version: 6 })).toMatchObject({ ok: false });
    expect(values.get(PULSE_STORAGE_KEY)).toBe(raw);
    expect(persistence.clear()).toEqual({ ok: true, value: undefined });
    expect(persistence.save({ version: 6 })).toEqual({ ok: true, value: undefined });
  });

  it("boyutu aşan mevcut kaydı da korur ve yazmayı kilitler", () => {
    const raw = `{"version":6,"padding":"${"x".repeat(4096)}"}`;
    const { storage, values } = fakeStorage({ [PULSE_STORAGE_KEY]: raw });
    const persistence = createLocalStoragePersistence(storage);

    expect(persistence.load()).toMatchObject({ ok: false, code: "oversize" });
    expect(persistence.save({ version: 6 })).toMatchObject({ ok: false });
    expect(values.get(PULSE_STORAGE_KEY)).toBe(raw);
  });

  it("okuma hatasından sonra önceki kaydı korur; başarılı yeniden okumayla yazma açılır", () => {
    let failRead = true;
    const values = new Map([[PULSE_STORAGE_KEY, '{"version":6,"marker":"saved"}']]);
    const storage: PersistenceStorage = {
      getItem: (key) => { if (failRead) throw new Error("unavailable"); return values.get(key) ?? null; },
      setItem: (key, value) => { values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const persistence = createLocalStoragePersistence(storage);

    expect(persistence.load()).toMatchObject({ ok: false, code: "storage" });
    expect(persistence.save({ version: 6, marker: "replacement" })).toMatchObject({ ok: false });
    expect(values.get(PULSE_STORAGE_KEY)).toBe('{"version":6,"marker":"saved"}');
    failRead = false;
    expect(persistence.load()).toEqual({ ok: true, value: { version: 6, marker: "saved" } });
    expect(persistence.save({ version: 6, marker: "replacement" })).toEqual({ ok: true, value: undefined });
  });

  it("legacy anahtardan yükler, sonraki kaydı güncel anahtara alır ve clear tüm anahtarları siler", () => {
    const legacyKey = PULSE_LEGACY_STORAGE_KEYS[0];
    const legacy = { version: 5, mode: "af" };
    const { storage, values } = fakeStorage({ [legacyKey]: JSON.stringify(legacy) });
    const persistence = createLocalStoragePersistence(storage);

    expect(persistence.load()).toEqual({ ok: true, value: legacy });
    expect(persistence.save({ version: 6, mode: "af" })).toEqual({ ok: true, value: undefined });
    expect(values.has(PULSE_STORAGE_KEY)).toBe(true);
    expect(values.has(legacyKey)).toBe(true);
    expect(persistence.clear()).toEqual({ ok: true, value: undefined });
    expect(values.size).toBe(0);
  });

  it("memory adapter aynı politika ile çalışır ve storage globali gerektirmez", () => {
    const persistence = createMemoryPersistence();
    const value = { version: 6, answer: 2 };
    expect(persistence.save(value)).toEqual({ ok: true, value: undefined });
    expect(persistence.load()).toEqual({ ok: true, value });
    expect(persistence.clear()).toEqual({ ok: true, value: undefined });
    expect(persistence.load()).toEqual({ ok: true, value: null });
  });

  it("independent_scorm eşlemesi: bozuk/oversize resume ve yazma hatasında başarı bildirmez", () => {
    let failWrite = true;
    const values = new Map([[PULSE_STORAGE_KEY, '{"version":6}']]);
    const storage: PersistenceStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { if (failWrite) throw new Error("quota"); values.set(key, value); },
      removeItem: (key) => { values.delete(key); },
    };
    const persistence = createLocalStoragePersistence(storage);
    expect(persistence.load()).toEqual({ ok: true, value: { version: 6 } });
    expect(persistence.save({ version: 6, marker: "retry" })).toMatchObject({ ok: false, code: "storage" });
    failWrite = false;
    expect(persistence.save({ version: 6, marker: "retry" })).toEqual({ ok: true, value: undefined });
  });
});
