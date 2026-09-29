import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PatientStage, createNoopStageEnv, createStageSession } from "../../packages/sim-ausculta/src/index";
import type { PatientStageProps, StageAudio, StagePoint, StageSessionBindings } from "../../packages/sim-ausculta/src/index";

/** PatientStage statik işaretleme — DOM kütüphanesi yok. */

const env = createNoopStageEnv();

const aortic: StagePoint = {
  id: "cardiac_aortic",
  view: "front",
  label: "Aort",
  color: "s1",
  tagSide: "left",
  x: 0.46,
  y: 0.27,
  xf: 0.44,
  yf: 0.26,
};

const lung: StagePoint = {
  id: "lung_left",
  view: "back",
  label: "Sol akciğer",
  color: "s2",
  tagSide: "right",
  x: 0.62,
  y: 0.4,
};

function engine(): StageAudio {
  return {
    play: async () => undefined,
    replay: async () => undefined,
    stop: () => undefined,
    setVolume: () => undefined,
    getActive: () => null,
    ensureContext: async () => undefined,
  };
}

function render(props: Partial<PatientStageProps> = {}): string {
  return renderToStaticMarkup(
    createElement(PatientStage, {
      points: [aortic, lung],
      view: "front",
      head: "diaphragm",
      volume: 0.8,
      showPoints: true,
      showLabels: true,
      mode: "learn",
      engine: engine(),
      env,
      soundFor: () => null,
      onVisit: () => undefined,
      onDwell: () => undefined,
      onListen: () => undefined,
      onPlayingChange: () => undefined,
      ...props,
    }),
  );
}

describe("PatientStage", () => {
  it("ön gövdede fotoğraf, hotspot etiketi ve 44 px stetoskop sunar", () => {
    const html = render();
    expect(html).toContain('class="stage "');
    expect(html).toContain('src="assets/body/front.jpg"');
    expect(html).toContain('alt="Hasta ön gövde görünümü"');
    expect(html).toContain("hotspot s1");
    expect(html).toContain("Aort");
    expect(html).not.toContain("Sol akciğer");
    expect(html).toContain('role="button"');
    expect(html).toContain("ok tuşlarıyla");
    expect(html).toContain("min-width:44px");
    expect(html).toContain("min-height:44px");
    expect(html).toContain("Stetoskopu oskültasyon bölgesine sürükleyin");
    // T228: tüp katmanı hotspot'ların üstünde, göğüs parçasının altında.
    expect(html).toContain('class="tube-layer"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="tube-line"');
    expect(html).toContain('class="tube-fork"');
    expect(html.indexOf('class="tube-layer"')).toBeLessThan(html.indexOf('class="steth'));
  });

  it("klavye adımı geometri sınırında kalır ve yerleştirme tuşu noktayı seçer", () => {
    const visits: string[] = [];
    const pos = { x: 0.5, y: 0.75 };
    const bindings: StageSessionBindings = {
      points: [aortic],
      bodyType: "erkek",
      view: "front",
      head: "bell",
      strict: false,
      env,
      engine: engine(),
      soundFor: () => null,
      onVisit: (id: string) => visits.push(id),
      onDwell: () => undefined,
      onListen: () => undefined,
      onPlayingChange: () => undefined,
      onSnapped: () => undefined,
      onPlaying: () => undefined,
      onSpent: () => undefined,
      onAudioStatus: () => undefined,
      onPulse: () => undefined,
      getPos: () => pos,
      setPos: (next) => {
        pos.x = next.x;
        pos.y = next.y;
      },
      applyPos: () => undefined,
      measure: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    };
    const session = createStageSession(bindings);
    expect(session.keyDown("ArrowUp")).toBe("moved");
    expect(pos.y).toBeCloseTo(0.73);
    expect(session.keyDown("KeyA")).toBe("ignored");
    pos.x = aortic.x;
    pos.y = aortic.y;
    expect(session.keyDown("Enter")).toBe("placed");
    expect(visits).toEqual(["cardiac_aortic"]);
  });
});
