import { describe, expect, it } from "vitest";
import {
  LIBRARY_GROUPS,
  countUnlistenedInOtherView,
  listenedKeyOnPlay,
  otherViewHintText,
  planLibraryViews,
  resolveLibrarySoundEx,
} from "../../packages/sim-ausculta/src/index";
import pointsData from "../../packages/sim-ausculta/src/data/auscultation-points.json" with { type: "json" };

// T233 — öğrenme kütüphanesi görünüm kuralı: kalp → ön, akciğer → arka, karma → ikisi
// (dinlenecek/çalınabilir noktası olan). Öğrenme kilidi (T209) her öğe için izinli
// görünümde çalınabilir bir nokta bırakmalıdır.

const POINTS = (pointsData as unknown as { points: { id: string; view: "front" | "back" }[] }).points;
const POINT_VIEW = new Map(POINTS.map((point) => [point.id, point.view]));
const ITEMS = LIBRARY_GROUPS.flatMap((group) => group.items);

const viewOf = (pointId: string) => POINT_VIEW.get(pointId);
const playableFor = (category: string, finding: string) => (pointId: string) => resolveLibrarySoundEx(category, finding, pointId).record !== null;

describe("planLibraryViews (saf fonksiyon)", () => {
  const views = {
    front: "cardiac_mitral" as string,
    back: "lung_left_upper_posterior" as string,
  };
  const viewOfId = (pointId: string): "front" | "back" | undefined =>
    pointId === views.front ? "front" : pointId === views.back ? "back" : undefined;

  it("kalp öne, akciğer arkaya kilitlenir; nokta listesi izinli görünüme süzülür", () => {
    const heart = planLibraryViews("heart", [views.front, views.back], viewOfId, () => true);
    expect(heart.views).toEqual(["front"]);
    expect(heart.pointIds).toEqual([views.front]);
    const lung = planLibraryViews("lung", [views.back, views.front], viewOfId, () => true);
    expect(lung.views).toEqual(["back"]);
    expect(lung.pointIds).toEqual([views.back]);
  });

  it("karma içerikte çalınabilir noktası olan görünümler açık kalır", () => {
    const both = planLibraryViews("mixed", [views.front, views.back], viewOfId, () => true);
    expect(both.views).toEqual(["front", "back"]);
    const onlyBack = planLibraryViews("mixed", [views.back], viewOfId, () => true);
    expect(onlyBack.views).toEqual(["back"]);
  });

  it("çalınamayan nokta sunulabilir sayılmaz; kural dışı görünüm açılmaz", () => {
    const heart = planLibraryViews("heart", [views.front, views.back], viewOfId, (id) => id !== views.front);
    // Ön nokta çalınamıyorsa ön sunulabilir değildir → kural dışı arka geri düşüşle açılır.
    expect(heart.views).toEqual(["back"]);
    expect(heart.pointIds).toEqual([views.back]);
  });
});

describe("kütüphane öğeleri — izinli görünümde çalınabilir nokta", () => {
  it("20 öğenin her biri izinli görünümde çalınabilir noktaya sahip (kilit tamamlanabilir)", () => {
    expect(ITEMS).toHaveLength(20);
    for (const item of ITEMS) {
      const plan = planLibraryViews(item.category, item.bestPoints, viewOf, playableFor(item.category, item.acousticFinding));
      expect(plan.views.length, item.key).toBeGreaterThan(0);
      expect(plan.pointIds.length, item.key).toBeGreaterThan(0);
      const playable = plan.pointIds.filter((pointId) => resolveLibrarySoundEx(item.category, item.acousticFinding, pointId).record !== null);
      expect(playable.length, item.key).toBeGreaterThan(0);
      // T209: oynatma gerçekten başladığında öğe dinlendi sayılır — izinli noktalarla.
      for (const pointId of playable) expect(listenedKeyOnPlay(true, pointId, item.key, plan.pointIds), item.key).toBe(item.key);
      // İzinli olmayan görünümde nokta bırakılmaz.
      const allowed = new Set(plan.views);
      for (const pointId of plan.pointIds) expect(allowed.has(viewOf(pointId) ?? "front"), `${item.key}/${pointId}`).toBe(true);
    }
  });

  it("kalp öğeleri yalnız ön, akciğer öğeleri yalnız arka görünümde açılır", () => {
    for (const item of ITEMS) {
      const plan = planLibraryViews(item.category, item.bestPoints, viewOf, playableFor(item.category, item.acousticFinding));
      if (item.category === "heart") expect(plan.views, item.key).toEqual(["front"]);
      if (item.category === "lung") expect(plan.views, item.key).toEqual(["back"]);
      if (item.category === "mixed") expect(plan.views, item.key).toEqual(["front", "back"]);
    }
  });

  it("tek izinli görünümde 'diğer görünümde dinlenmemiş bölge' ipucu çıkmaz", () => {
    for (const item of ITEMS) {
      const plan = planLibraryViews(item.category, item.bestPoints, viewOf, playableFor(item.category, item.acousticFinding));
      if (plan.views.length !== 1) continue;
      const view = plan.views[0];
      if (view === undefined) continue;
      expect(countUnlistenedInOtherView(POINTS, plan.pointIds, view, {}), item.key).toBe(0);
      expect(otherViewHintText(view, 0), item.key).toBeNull();
    }
  });
});
