import { describe, expect, it } from "vitest";
import { INITIAL_STAGE_POSITION, KEYBOARD_STEP, clampStagePosition, fitStageBox, isPediatricSchematic, isPlaceKey, nudgeStagePosition, pointerToStagePosition, stageViewConfig } from "../../packages/sim-ausculta/src/index";

const rect = { left: 100, top: 50, width: 1000, height: 800 };

describe("hasta sahnesi geometrisi", () => {

  it("görseli kapsayıcıya letterbox'suz sığdırır; 10 px altında kutu üretmez", () => {
    expect(fitStageBox({ width: 1000, height: 900 }, { width: 1000, height: 900 })).toEqual({ w: 1000, h: 900 });
    expect(fitStageBox({ width: 500, height: 900 }, { width: 1000, height: 500 })).toEqual({ w: 500, h: 250 });
    expect(fitStageBox({ width: 1000, height: 200 }, { width: 1000, height: 500 })).toEqual({ w: 400, h: 200 });
    expect(fitStageBox({ width: 9, height: 400 }, { width: 1000, height: 900 })).toBeNull();
    expect(fitStageBox({ width: 400, height: 9 }, { width: 1000, height: 900 })).toBeNull();
  });

  it("işaretçiyi sahne kenarlarında sınırlar", () => {
    expect(pointerToStagePosition(100, 50, rect)).toEqual({ x: 0.01, y: 0.02 });
    expect(pointerToStagePosition(1100, 850, rect)).toEqual({ x: 0.99, y: 0.98 });
    expect(pointerToStagePosition(600, 450, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(clampStagePosition(-1, 2)).toEqual({ x: 0.01, y: 0.98 });
  });

  it("ok tuşları yüzde 2 adım atar ve aynı kenar sınırını kullanır", () => {
    expect(INITIAL_STAGE_POSITION).toEqual({ x: 0.5, y: 0.75 });
    expect(nudgeStagePosition(INITIAL_STAGE_POSITION, "ArrowUp")).toEqual({ x: 0.5, y: 0.75 - KEYBOARD_STEP });
    expect(nudgeStagePosition(INITIAL_STAGE_POSITION, "ArrowDown")).toEqual({ x: 0.5, y: 0.77 });
    expect(nudgeStagePosition(INITIAL_STAGE_POSITION, "ArrowLeft")).toEqual({ x: 0.48, y: 0.75 });
    expect(nudgeStagePosition(INITIAL_STAGE_POSITION, "ArrowRight")).toEqual({ x: 0.52, y: 0.75 });
    expect(nudgeStagePosition({ x: 0.02, y: 0.03 }, "ArrowUp")).toEqual({ x: 0.02, y: 0.02 });
    expect(nudgeStagePosition({ x: 0.02, y: 0.97 }, "ArrowDown")).toEqual({ x: 0.02, y: 0.98 });
    expect(nudgeStagePosition({ x: 0.02, y: 0.5 }, "ArrowLeft")).toEqual({ x: 0.01, y: 0.5 });
    expect(nudgeStagePosition({ x: 0.98, y: 0.5 }, "ArrowRight")).toEqual({ x: 0.99, y: 0.5 });
    expect(nudgeStagePosition(INITIAL_STAGE_POSITION, "Enter")).toBeNull();
    expect(isPlaceKey("Enter")).toBe(true);
    expect(isPlaceKey(" ")).toBe(true);
    expect(isPlaceKey("ArrowUp")).toBe(false);
  });

  it("görünüm yapılandırması gövde anahtarına ve pediatrik şemaya bakar", () => {
    const male = stageViewConfig("front", "erkek");
    const female = stageViewConfig("back", "kadin");
    const child = stageViewConfig("front", "pediatrik");
    const childBack = stageViewConfig("back", "pediatrik");

    expect(male).toMatchObject({ image: "assets/body/front.jpg", width: 1000, height: 933 });
    expect(female.image).toBe("assets/body/back-female.jpg");
    expect(female).toMatchObject({ width: 1000, height: 853 });
    expect(child).toMatchObject({ svg: "pediatric-front", width: 1000, height: 900 });
    expect(isPediatricSchematic(child)).toBe(true);
    expect(isPediatricSchematic(childBack)).toBe(true);
    expect(isPediatricSchematic(male)).toBe(false);
  });
});
