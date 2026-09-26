import { describe, expect, it } from "vitest";
import libraryData from "../../packages/sim-ausculta/src/data/library.json";
import { isVisitorUnlocked, VISITOR_UNLOCKED_LEARN_ITEMS } from "../../packages/sim-ausculta/src/core/visitorAccess";

/** Ziyaretçi kilidi — saf modül (T174). Kimlik listesi sabit; UI yalnız sorgular. */

const allKeys = libraryData.groups.flatMap((group) => group.items.map((item) => item.key));

describe("visitorAccess", () => {
  it("normal ses + ilk 2 kategorinin ilk normal-olmayan sesini açar", () => {
    expect(VISITOR_UNLOCKED_LEARN_ITEMS).toEqual(["heart.normal", "heart.s3", "lung.normal", "lung.wheezing"]);
  });

  it("her açık kimlik kataloğunda gerçekten var olmalı", () => {
    for (const key of VISITOR_UNLOCKED_LEARN_ITEMS) {
      expect(allKeys).toContain(key);
    }
  });

  it("isVisitorUnlocked yalnız listedeki kimlikler için true döner", () => {
    expect(isVisitorUnlocked("heart.normal")).toBe(true);
    expect(isVisitorUnlocked("heart.s3")).toBe(true);
    expect(isVisitorUnlocked("lung.normal")).toBe(true);
    expect(isVisitorUnlocked("lung.wheezing")).toBe(true);
  });

  it("diğer tüm katalog kimlikleri kilitli kalır", () => {
    const locked = allKeys.filter((key) => !VISITOR_UNLOCKED_LEARN_ITEMS.includes(key));
    expect(locked.length).toBeGreaterThan(0);
    for (const key of locked) {
      expect(isVisitorUnlocked(key)).toBe(false);
    }
  });

  it("bilinmeyen bir kimlik için false döner", () => {
    expect(isVisitorUnlocked("unknown.key")).toBe(false);
  });
});
