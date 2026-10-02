import { describe, expect, it } from "vitest";
import {
  LIBRARY_GROUPS,
  countUnlistenedInOtherView,
  listenedKeyOnPlay,
  otherViewHintText,
  resolveLibrarySoundEx,
} from "../../packages/sim-ausculta/src/index";
import { learnExamples } from "../../packages/sim-ausculta/src/data/learnSets";
import { examplePointIds, viewsOf } from "../../packages/sim-ausculta/src/screens/LearnScreen";
import pointsData from "../../packages/sim-ausculta/src/data/auscultation-points.json" with { type: "json" };

// T307 — öğrenme görünüm kuralı: her örnek yalnız kaydı/sesi olan noktaları ve bu
// noktaların görünümlerini açar. Sentetik kütüphane örneği lateral açmaz; lateral
// görünüm yalnız lateral kaydı olan örnekte çıkar. Öğrenme kilidi (T209/T307) her öğe
// için çalınabilir bir nokta bırakmalıdır.

type View = "front" | "back" | "left" | "right";
const POINTS = (pointsData as unknown as { points: { id: string; view: View; group: string }[] }).points;
const POINT_VIEW = new Map(POINTS.map((point) => [point.id, point.view]));
const ITEMS = LIBRARY_GROUPS.flatMap((group) => group.items);

const playableFor = (category: string, finding: string) => (pointId: string) =>
  resolveLibrarySoundEx(category, finding, pointId).record !== null;

describe("öğrenme örnekleri — görünüm ve nokta kuralı", () => {
  it("24 öğenin her örneği en az bir noktaya sahip; noktalar yalnız açılan görünümlerde", () => {
    expect(ITEMS).toHaveLength(24);
    for (const item of ITEMS) {
      for (const example of learnExamples(item.key)) {
        const pointIds = examplePointIds(example, item.category, playableFor(item.category, item.acousticFinding));
        expect(pointIds.length, item.key).toBeGreaterThan(0);
        const views = new Set(viewsOf(pointIds));
        for (const pointId of pointIds) {
          expect(views.has(POINT_VIEW.get(pointId) ?? "front"), `${item.key}/${pointId}`).toBe(true);
          expect(listenedKeyOnPlay(true, pointId, item.key, pointIds)).toBe(item.key);
        }
      }
    }
  });

  it("sentetik kütüphane örneği lateral açmaz ve konunun grubuyla sınırlıdır", () => {
    for (const item of ITEMS) {
      const [first] = learnExamples(item.key);
      if (first?.kind !== "library") continue;
      const pointIds = examplePointIds(first, item.category, playableFor(item.category, item.acousticFinding));
      for (const pointId of pointIds) {
        const view = POINT_VIEW.get(pointId);
        expect(view === "left" || view === "right", `${item.key}/${pointId}`).toBe(false);
        const group = POINTS.find((point) => point.id === pointId)?.group;
        if (item.category === "heart") expect(group, `${item.key}/${pointId}`).toBe("cardiac");
        if (item.category === "lung") expect(group, `${item.key}/${pointId}`).toBe("lung");
      }
    }
  });

  it("görünüm sırası kanoniktir: anterior → posterior → sol → sağ lateral", () => {
    const lateral = POINTS.filter((point) => point.view === "right" || point.view === "left").map((point) => point.id);
    const ids = [...lateral, "lung_left_upper_posterior", "cardiac_mitral"];
    expect(viewsOf(ids)).toEqual(["front", "back", "left", "right"]);
  });

  it("tek görünümde 'diğer görünümde dinlenmemiş bölge' ipucu çıkmaz", () => {
    for (const item of ITEMS) {
      const [first] = learnExamples(item.key);
      if (!first) continue;
      const pointIds = examplePointIds(first, item.category, playableFor(item.category, item.acousticFinding));
      const views = viewsOf(pointIds);
      if (views.length !== 1) continue;
      const view = views[0];
      if (view === undefined) continue;
      expect(countUnlistenedInOtherView(POINTS, pointIds, view, {}), item.key).toBe(0);
      expect(otherViewHintText(view, 0), item.key).toBeNull();
    }
  });
});
