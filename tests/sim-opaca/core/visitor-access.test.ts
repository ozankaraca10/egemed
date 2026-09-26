import { describe, expect, it } from "vitest";
import {
  LIBRARY_GROUPS,
  LIBRARY_ITEMS,
  VISITOR_UNLOCKED_ITEM_KEYS,
  isVisitorUnlocked,
} from "../../../packages/sim-opaca/src/index";

/** T175 — ziyaretçi kilidi: ilk kategori (technique/"Temel okuma", normal grafi dahil) tamamen
 *  açık + sonraki iki kategorinin ilk bulgusu ("normal + 2" kalıbı, 26 Eyl 2026). */
describe("visitorAccess (T175)", () => {
  it("ilk kategorinin tamamı ve sonraki iki kategorinin ilk bulgusu açıktır", () => {
    const [first, second, third] = LIBRARY_GROUPS;
    expect(first?.id).toBe("technique");
    const expected = [...(first?.items ?? []).map((it) => it.key), second?.items[0]?.key, third?.items[0]?.key];
    expect([...VISITOR_UNLOCKED_ITEM_KEYS]).toEqual(expected);
    expect(VISITOR_UNLOCKED_ITEM_KEYS).toContain("finding.normal");
  });

  it("isVisitorUnlocked yalnız sabit listedeki kimlikler için true döner", () => {
    expect(isVisitorUnlocked("finding.normal")).toBe(true);
    expect(isVisitorUnlocked("finding.pneumothorax")).toBe(true);
    expect(isVisitorUnlocked("finding.airspace_opacity")).toBe(true);
    expect(isVisitorUnlocked("finding.pleural_effusion")).toBe(false);
    expect(isVisitorUnlocked("finding.cardiomegaly")).toBe(false);
    expect(isVisitorUnlocked("bilinmeyen.anahtar")).toBe(false);
  });

  it("tüm LIBRARY_ITEMS üzerinde tam olarak 6 öğe açık kalır", () => {
    expect(LIBRARY_ITEMS.filter((it) => isVisitorUnlocked(it.key)).length).toBe(6);
  });
});
