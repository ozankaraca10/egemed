import { describe, expect, it, vi } from "vitest";
import type { SimMountContext, SimMountTarget, SimNavigation } from "../../packages/sim-host/src/SimHost";
import { createPulseRuntimeModule } from "../../packages/sim-pulse/src/runtime/module";

/** T271b: Pulse runtime modülünün SimNavigation köprüsü. Gerçek runtime gölge
 *  DOM ister; burada `mountPulseRuntime` sahte bir tutamakla değiştirilir ve
 *  yalnız modülün köprü mantığı sınanır: `cardai:view` → anahtar, abonelik →
 *  `showView`, bastırma bayrağının döngüyü kırması. Kaynak koda dokunulmaz (T279). */

const NOW = 1_728_000_000_000;

interface PulseBridge {
  onEvent?(type: string, detail: unknown): void;
}

const hostCapture = vi.hoisted(() => ({
  capture: null as null | ((options: unknown) => unknown),
}));

vi.mock("../../packages/sim-pulse/src/runtime/host", () => ({
  mountPulseRuntime: (_target: unknown, options: unknown) => {
    if (hostCapture.capture === null) throw new Error("test: mountPulseRuntime beklenmiyor");
    return hostCapture.capture(options);
  },
}));

interface NavigationWrite {
  readonly key: string | null;
  readonly replace: boolean;
}

function setup(
  options: { initial?: string | null; activeView?: string; assessed?: boolean; redirect?: Record<string, string> } = {},
) {
  const writes: NavigationWrite[] = [];
  const listeners = new Set<(key: string | null) => void>();
  const navigation: SimNavigation = {
    initial: options.initial ?? null,
    report(key, reportOptions) {
      writes.push({ key, replace: reportOptions?.replace === true });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const shown: string[] = [];
  const bridge: { current: PulseBridge | null } = { current: null };
  const controller = {
    state: { activeView: options.activeView ?? "modes", assessed: options.assessed ?? false },
    showView(view: string): void {
      shown.push(view);
      const actual = options.redirect?.[view] ?? view;
      controller.state.activeView = actual;
      // Kaynak `showView` sonunda `cardai:view` yayınlar (vendor/app.js); köprüye
      // aynı yoldan iletilir.
      bridge.current?.onEvent?.("cardai:view", { view: actual });
    },
  };

  const handle = {
    global: (name: string) => (name === "CardAIController" ? controller : name === "CardAILanding" ? { enter: () => undefined } : undefined),
    setGlobal: () => undefined,
    emit: () => undefined,
    dispose: () => undefined,
    shadow: { getElementById: () => null, ownerDocument: { defaultView: undefined } },
  };

  hostCapture.capture = (runtimeOptions) => {
    bridge.current = (runtimeOptions as { bridge?: PulseBridge }).bridge ?? null;
    return handle;
  };

  const context: SimMountContext = { simId: "pulse", now: () => NOW, navigation };
  const target: SimMountTarget = { appendChild: () => undefined };
  const dispose = createPulseRuntimeModule({ gamiEnabled: false }).mount(target, context);

  return {
    writes,
    shown,
    dispose,
    /** Kaynak içinde bir görünüme geçilmiş gibi köprü olayı yayar. */
    emitView(view: string): void {
      bridge.current?.onEvent?.("cardai:view", { view });
    },
    /** Kabuk kaynaklı (geri/ileri/hash) anahtar değişimi. */
    navigate(key: string | null): void {
      for (const listener of [...listeners]) listener(key);
    },
  };
}

describe("Pulse gezinme köprüsü (T271b)", () => {
  it("cardai:view olayları anahtara çevrilip push ile raporlanır; bilinmeyen görünüm yok sayılır", () => {
    const { emitView, writes } = setup();
    emitView("modes");
    emitView("sim");
    emitView("case");
    emitView("quiz");
    emitView("results");
    emitView("about");
    emitView("tutorial");
    expect(writes).toEqual([
      { key: "modlar", replace: false },
      { key: "ogrenme", replace: false },
      { key: "uygulama", replace: false },
      { key: "degerlendirme", replace: false },
      { key: "sonuc", replace: false },
    ]);
  });

  it("abonelik anahtarları showView'a çevirir; görünümün kendi olayı geri raporlanmaz", () => {
    const { navigate, shown, writes } = setup();
    navigate("modlar");
    navigate("ogrenme");
    navigate("uygulama");
    navigate("degerlendirme");
    expect(shown).toEqual(["modes", "sim", "case", "quiz"]);
    expect(writes).toEqual([]);
  });

  it("bastırma bayrağı showView'ın yaydığı olayı yutar, sonraki olayı yutmaz", () => {
    const { navigate, emitView, writes } = setup();
    navigate("uygulama");
    expect(writes).toEqual([]);
    emitView("quiz");
    expect(writes).toEqual([{ key: "degerlendirme", replace: false }]);
  });

  it("değerlendirilmemiş sonuç güvenli ekrana düşer, showView çağrılmaz", () => {
    const { navigate, shown, writes } = setup();
    navigate("sonuc");
    expect(shown).toEqual([]);
    expect(writes).toEqual([{ key: "modlar", replace: true }]);
  });

  it("runtime'ın yönlendirdiği kilitli görünüm gerçek anahtarla replace edilir", () => {
    const { navigate, shown, writes } = setup({ redirect: { case: "modes" } });
    navigate("uygulama");
    expect(shown).toEqual(["case"]);
    expect(writes).toEqual([{ key: "modlar", replace: true }]);
  });

  it("bilinmeyen anahtar yok sayılır", () => {
    const { navigate, shown, writes } = setup();
    navigate("yardim");
    navigate("hakkinda");
    expect(shown).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("derin bağlantı mount'ta uygulanır ve sonraki olayları engellemez", () => {
    const { emitView, shown, writes } = setup({ initial: "degerlendirme" });
    expect(shown).toEqual(["quiz"]);
    expect(writes).toEqual([]);
    emitView("modes");
    expect(writes).toEqual([{ key: "modlar", replace: false }]);
  });

  it("dispose aboneliği bırakır", () => {
    const { navigate, shown, dispose } = setup();
    dispose();
    navigate("ogrenme");
    expect(shown).toEqual([]);
  });
});
