import { describe, expect, it } from "vitest";
import {
  HEART_PHASES, HEART_REGIONS, heartMarkup, highlightedHeartRegions, isHeartRegionActive,
} from "../../packages/sim-pulse/src/index";
import type { HeartPhase } from "../../packages/sim-pulse/src/index";

describe("Pulse kalp SVG", () => {
  it("kaynak sahne kimliklerini ve erişilebilir açıklamayı şablonda tutar", () => {
    const markup = heartMarkup();
    for (const id of ["heartSvg", "heartTitle", "heartDesc", "heartWall", "ra", "la", "rv", "lv",
      "vessels", "flowPaths", "tricuspid", "mitral", "pulmonaryValve", "aorticValve", "conduction",
      "saNode", "avNode", "ischemicRegion", "coronaryFlow", "anatomyLabels"]) {
      expect(markup).toContain(`id="${id}"`);
    }
    expect(markup).toContain('role="img" aria-labelledby="heartTitle heartDesc"');
    expect(markup).toContain("Kalp, akciğer ve sistemik dolaşım");
    expect(markup).toContain('viewBox="0 0 540 560"');
  });

  it("her fazı kaynak mekanik olayına ait bölgelere safça eşler", () => {
    const expected: Record<HeartPhase, readonly string[]> = {
      atrial: ["atria", "conduction"],
      qrs: ["ventricles", "conduction"],
      eject: ["ventricles", "outflow-valves"],
      t: ["ventricles"],
      fill: ["atria", "ventricles", "av-valves"],
      chaotic: ["ventricles", "fibrillation"],
    };
    expect(HEART_PHASES).toEqual(Object.keys(expected));
    for (const phase of HEART_PHASES) {
      expect(highlightedHeartRegions(phase)).toEqual(expected[phase]);
      for (const region of HEART_REGIONS) {
        expect(isHeartRegionActive(phase, region)).toBe(expected[phase].includes(region));
      }
    }
    expect(highlightedHeartRegions("unknown")).toEqual(expected.fill);
  });

  it("SVG şablonunda yalnız faza ait bölgeleri etkin işaretler", () => {
    const markup = heartMarkup("eject");
    expect(markup).toContain('<svg id="heartSvg" data-phase="eject"');
    expect(markup).toContain('data-heart-region="outflow-valves" data-active="true"');
    expect(markup).toContain('data-heart-region="atria" data-active="false"');
    expect(heartMarkup('<img src=x onerror=alert(1)>')).toContain('data-phase="fill"');
  });
});
