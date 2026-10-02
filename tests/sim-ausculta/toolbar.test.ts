import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QUESTION_JUMP_SELECTOR, RegionChipList, StoreProvider, Toolbar, createMemoryRuntimeAdapter, createNoopToolbarEnv, initialState, performToolbar, showHintControl } from "../../packages/sim-ausculta/src/index";
import type {
  AppState,
  AuscultationPoint,
  CaseDef,
  PatientView,
  Question,
  StoragePort,
  ToolbarAudio,
  ToolbarPorts,
  WindowLike,
} from "../../packages/sim-ausculta/src/index";

/** Araç çubuğu ve bölge çipleri — statik işaretleme, DOM kütüphanesi yok. */

const question: Question = {
  id: "q1",
  type: "sound_identify",
  domain: "recognition",
  prompt: "Hangi ses?",
  options: [{ id: "a", label: "Üfürüm" }],
  correct: ["a"],
  feedbackCorrect: "Doğru",
  feedbackIncorrect: "Yanlış",
  hint: "Çanı deneyin",
};

const points: AuscultationPoint[] = [
  {
    id: "aortic",
    view: "front",
    group: "cardiac",
    label: "Aort",
    fullLabel: "Aort odağı",
    detail: "2. sağ",
    side: "right",
    x: 0.4,
    y: 0.3,
    color: "s1",
    tagSide: "left",
  },
  {
    id: "mitral",
    view: "front",
    group: "cardiac",
    label: "Mitral",
    fullLabel: "Mitral odağı",
    detail: "apeks",
    side: "left",
    x: 0.6,
    y: 0.5,
    color: "s2",
    tagSide: "right",
  },
  {
    id: "lung",
    view: "back",
    group: "lung",
    label: "Akciğer",
    fullLabel: "Sol akciğer",
    detail: "arka",
    side: "left",
    x: 0.4,
    y: 0.4,
    color: "s3",
    tagSide: "left",
  },
];

function windowEnv(): WindowLike {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
    visibilityState: "visible",
  };
}

function memoryStorage(): StoragePort {
  return { get: () => null, set: () => undefined };
}

function engine(): ToolbarAudio {
  return { setVolume: () => undefined };
}

function ports(overrides: Partial<ToolbarPorts> = {}): ToolbarPorts {
  return {
    dispatch: () => undefined,
    emit: () => undefined,
    engine: engine(),
    env: createNoopToolbarEnv(),
    stage: { current: null },
    openHint: () => undefined,
    ...overrides,
  };
}

function renderToolbar(
  state: Partial<AppState> = {},
  extra: {
    strict?: boolean;
    activePoint?: string | null;
    initialHintOpen?: boolean;
    withCase?: boolean;
    withQuestion?: boolean;
    allowedViews?: readonly PatientView[];
    caseViews?: readonly PatientView[];
  } = {},
): string {
  const activePoint = extra.activePoint === undefined ? "aortic" : extra.activePoint;
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      now: () => 1_700_000_000_000,
      storage: memoryStorage(),
      runtime: createMemoryRuntimeAdapter(),
      env: windowEnv(),
      initialState: { ...initialState, head: "diaphragm", view: "front", volume: 0.85, ...state },
      children: createElement(Toolbar, {
        stageRef: { current: null },
        activePoint,
        engine: engine(),
        ...(extra.withQuestion === false ? {} : { question }),
        ...(extra.withCase === false
          ? {}
          : { caseDef: { allowedHeads: ["bell", "diaphragm"], views: extra.caseViews ?? ["front", "back"] } as CaseDef }),
        ...(extra.strict ? { strict: true } : {}),
        ...(extra.initialHintOpen ? { initialHintOpen: true } : {}),
        ...(extra.allowedViews ? { allowedViews: extra.allowedViews } : {}),
      }),
    }),
  );
}

function button(html: string, text: string): string {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) =>
    (match[2] ?? "").replace(/<[^>]*>/g, "").includes(text),
  );
  if (!found) throw new Error(`düğme yok: ${text}`);
  return found[1] ?? "";
}

/** Düğmenin tam işaretlemesi (öznitelikler + içerik). */
function buttonMarkup(html: string, text: string): string {
  const found = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) =>
    (match[2] ?? "").replace(/<[^>]*>/g, "").includes(text),
  );
  if (!found) throw new Error(`düğme yok: ${text}`);
  return found[0];
}

describe("araç çubuğu etkileri", () => {
  it("kafa, görünüm, ses, tekrar, kaydırma ve ipucunu sınırlara iletir", () => {
    const dispatch = vi.fn();
    const emit = vi.fn();
    const setVolume = vi.fn();
    const replay = vi.fn();
    const openHint = vi.fn();
    const onHint = vi.fn();
    const scroll = vi.fn();
    const audio = { setVolume };
    const bound = ports({
      dispatch,
      emit,
      engine: audio,
      stage: { current: { replay } },
      openHint,
      onHint,
      env: { query: (selector) => (selector === QUESTION_JUMP_SELECTOR ? { scrollIntoView: scroll } : null) },
    });

    performToolbar(bound, { kind: "head", head: "bell" });
    performToolbar(bound, { kind: "view", view: "back" });
    performToolbar(bound, { kind: "volume", volume: 0.4 });
    performToolbar(bound, { kind: "replay", activePoint: "aortic" });
    performToolbar(bound, { kind: "replay", activePoint: null });
    performToolbar(bound, { kind: "jump" });
    performToolbar(bound, { kind: "hint" });

    expect(dispatch.mock.calls.map((call) => call[0])).toEqual([
      { type: "setHead", head: "bell" },
      { type: "setView", view: "back" },
      { type: "setVolume", volume: 0.4 },
      { type: "replay" },
      { type: "replay" },
    ]);
    expect(emit.mock.calls.map((call) => call[0])).toEqual([
      { type: "view_changed", view: "back" },
      { type: "sound_replayed", pointId: "aortic" },
    ]);
    expect(setVolume).toHaveBeenCalledWith(0.4);
    expect(replay).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(onHint).toHaveBeenCalledTimes(1);
    expect(openHint).toHaveBeenCalledTimes(1);
    expect(showHintControl(false, "ipucu", false, 0)).toBe(true);
    expect(showHintControl(true, "ipucu", false, 0)).toBe(false);
    expect(showHintControl(false, "ipucu", true, 0)).toBe(false);
    expect(showHintControl(false, "ipucu", false, 1)).toBe(false);
  });
});

describe("araç çubuğu (statik render)", () => {
  it("seçili kafa ve görünümü aria-pressed ve im ile çizer", () => {
    const html = renderToolbar();
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Oskültasyon araçları"');
    expect(button(html, "Diyafram")).toContain('aria-pressed="true"');
    expect(html.match(/class="tool-mark"/g)).toHaveLength(2);
    expect(button(html, "Bell")).toContain('aria-pressed="false"');
    expect(button(html, "Anterior")).toContain('aria-pressed="true"');
    expect(button(html, "Posterior")).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Ses düzeyi"');
    expect(html).toContain('value="85"');
    expect(html).toContain(">%85<");
    expect(html).toContain("Tekrar Dinle");
    expect(html).toContain("Soruya git");
    expect(html).toContain("İpucu");
    expect(html).not.toContain("Sesi kıs");
    expect(html).not.toContain("Sesi aç");
    expect(html).toContain("min-width:44px");
    expect(html).not.toContain("hint-box");
  });

  it("açık ipucu, sıkı mod ve boş noktayı yansıtır", () => {
    const hinted = renderToolbar({}, { initialHintOpen: true });
    expect(hinted).toContain('role="note"');
    expect(hinted).toContain("Çanı deneyin");
    expect(hinted).toContain("puanı -5");
    expect(hinted).not.toContain(">İpucu<");

    const strict = renderToolbar({ hintsUsed: 1 }, { strict: true, activePoint: null, withCase: false });
    expect(strict).not.toContain("Tekrar Dinle");
    expect(strict).not.toContain("Soruya git");
    expect(strict).not.toContain(">İpucu<");

    const idle = renderToolbar({}, { activePoint: null, withQuestion: false });
    expect(button(idle, "Tekrar Dinle")).toContain("disabled");
    expect(idle).not.toContain(">İpucu<");
  });

  it("motor verilmezse kurulumu reddeder", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(StoreProvider, {
          now: () => 0,
          storage: memoryStorage(),
          runtime: createMemoryRuntimeAdapter(),
          env: windowEnv(),
          children: createElement(Toolbar, { stageRef: { current: null }, activePoint: null }),
        }),
      ),
    ).toThrow(/ses motoru yok/);
  });

  it("T233: izinli olmayan görünüm devre dışı, kilit imli ve açıklamalı çizilir", () => {
    const lung = renderToolbar({}, { caseViews: ["back"] });
    const front = buttonMarkup(lung, "Anterior");
    expect(front).toContain('disabled=""');
    expect(front).toContain('aria-disabled="true"');
    expect(front).toContain("view-locked");
    expect(front).toContain("Bu vakada dinlenecek anterior bölge yok");
    expect(lung).toContain("Anterior görünüm kapalı");
    expect(buttonMarkup(lung, "Posterior")).not.toContain('disabled=""');

    const heart = renderToolbar({}, { allowedViews: ["front"], caseViews: ["front"] });
    const back = buttonMarkup(heart, "Posterior");
    expect(back).toContain('disabled=""');
    expect(back).toContain('aria-disabled="true"');
    expect(back).toContain("Bu vakada dinlenecek posterior bölge yok");
    expect(buttonMarkup(heart, "Anterior")).not.toContain('disabled=""');

    // İki görünüm de izinliyse kilit yok.
    const mixed = renderToolbar();
    expect(buttonMarkup(mixed, "Anterior")).not.toContain('disabled=""');
    expect(buttonMarkup(mixed, "Posterior")).not.toContain('disabled=""');
    expect(mixed).not.toContain("view-note");
    // Lateral düğmeler yalnız izinliyse çizilir (T307 öğrenme).
    expect(mixed).not.toContain("Sol lat.");
    const lateral = renderToolbar({}, { allowedViews: ["back", "left"] });
    expect(buttonMarkup(lateral, "Sol lat.")).not.toContain('disabled=""');
    expect(lateral).not.toContain("Sağ lat.");
  });
});

describe("bölge çipleri", () => {

  it("aktif ve dinlenmiş durumu renk dışında im ve etiketle gösterir", () => {
    const html = renderToStaticMarkup(
      createElement(RegionChipList, {
        points,
        view: "front",
        activePoint: "aortic",
        visits: { mitral: { listenMs: 400 } },
        onSelect: () => undefined,
        otherViewHint: "Arka görünümde 1 bölge daha",
      }),
    );
    expect(html).toContain('role="group"');
    expect(button(html, "Aort")).toContain('aria-pressed="true"');
    expect(html).toContain('class="rc-current"');
    expect(button(html, "Aort")).toContain("seçili");
    expect(button(html, "Aort")).toContain('data-state="active"');
    expect(button(html, "Mitral")).toContain('aria-pressed="false"');
    expect(html).toContain('class="rc-check"');
    expect(button(html, "Mitral")).toContain("dinlendi");
    expect(html).not.toContain("Sol akciğer");
    expect(html).toContain("Arka görünümde 1 bölge daha");
    expect(html).toContain("min-width:44px");
  });

  it("odaklanana kadar gizli sınıfı ve özel başlığı taşır", () => {
    const html = renderToStaticMarkup(
      createElement(RegionChipList, {
        points,
        view: "back",
        activePoint: null,
        visits: {},
        onSelect: () => undefined,
        hideUntilFocus: true,
        title: "Arkada dinle",
      }),
    );
    expect(html).toContain("sr-only-until-focus");
    expect(html).toContain("Arkada dinle");
    expect(button(html, "Sol akciğer")).toContain('data-state="default"');
    expect(button(html, "Sol akciğer")).not.toContain("rc-check");
    expect(button(html, "Sol akciğer")).not.toContain("rc-current");
  });
});
