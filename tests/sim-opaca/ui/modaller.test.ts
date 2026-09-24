import { Fragment, createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ConfirmModal,
  Header,
  HelpModal,
  StoreProvider,
  TUTORIAL_STEPS,
  TutorialSteps,
  createMemoryRuntimeAdapter,
  createNoopModalEnv,
  tabTrapTarget,
} from "../../../packages/sim-opaca/src/index";
import type {
  ConfirmModalSeamProps,
  HelpModalSeamProps,
  StoragePort,
  WindowLike,
} from "../../../packages/sim-opaca/src/index";

/** Modal grubu — E2 §8 S9 kabulü: rol/başlık bağı, Esc/odak sözleşmesinin saf yardımcıları,
 *  S8 `ChromeModals` seam'iyle uyum. Effect'ler statik render'da koşmaz; sekme tuzağı kararı
 *  `tabTrapTarget` biriminde doğrulanır (DOM'suz). */

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: "visible",
};

function memoryStorage(): StoragePort {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
  };
}

function renderInStore(node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      now: () => 0,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
    })
  );
}

const confirmProps = {
  open: true,
  title: "Değerlendirmeden çıkılsın mı?",
  message: "İlerlemeniz kaydedilir, oturum devam ettirilebilir.",
  onConfirm: () => undefined,
  onCancel: () => undefined,
};

describe("Opaca ConfirmModal (statik render)", () => {
  it("dialog rolü, aria-modal ve başlık bağı çizilir", () => {
    const html = renderToStaticMarkup(createElement(ConfirmModal, confirmProps));
    expect(html).toContain('class="modal-overlay"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Değerlendirmeden çıkılsın mı?"');
    expect(html).toContain("<h3>Değerlendirmeden çıkılsın mı?</h3>");
    expect(html).toContain("İlerlemeniz kaydedilir, oturum devam ettirilebilir.");
    expect(html).toContain("confirm-modal");
    expect(html).toContain(">Çık</button>");
    expect(html).toContain(">Vazgeç</button>");
  });

  it("kapalıyken hiçbir şey çizilmez; etiketler özelleştirilebilir", () => {
    expect(renderToStaticMarkup(createElement(ConfirmModal, { ...confirmProps, open: false }))).toBe("");
    const html = renderToStaticMarkup(
      createElement(ConfirmModal, { ...confirmProps, confirmLabel: "Sil", cancelLabel: "Dur" })
    );
    expect(html).toContain(">Sil</button>");
    expect(html).toContain(">Dur</button>");
  });

  it("isteğe bağlı children mesaj ile eylemler arasına girer (A1)", () => {
    const html = renderToStaticMarkup(
      createElement(
        ConfirmModal,
        confirmProps,
        createElement("label", null, createElement("input", { type: "checkbox" }), "Tekrar sorma")
      )
    );
    const messageAt = html.indexOf("İlerlemeniz kaydedilir");
    const childAt = html.indexOf("Tekrar sorma");
    const actionsAt = html.indexOf("confirm-actions");
    expect(messageAt).toBeGreaterThan(-1);
    expect(childAt).toBeGreaterThan(messageAt);
    expect(actionsAt).toBeGreaterThan(childAt);
  });
});

describe("Opaca HelpModal (statik render)", () => {
  it("dialog rolü, başlık, kapatma düğmesi ve içerik blokları çizilir", () => {
    const html = renderToStaticMarkup(createElement(HelpModal, { open: true, onClose: () => undefined }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Yardım"');
    expect(html).toContain("<h3>Nasıl Kullanılır?</h3>");
    expect(html).toContain('aria-label="Yardım penceresini kapat"');
    expect(html).toContain('title="Kapat"');
    expect(html).toContain("help-modal");
    expect(html).toContain("help-tips");
    expect(html).toContain("İpuçları");
    expect(html).toContain("help-note");
    expect(html).toContain("Bu simülatör eğitim amaçlıdır; tanı koydurmaz.");
    expect(renderToStaticMarkup(createElement(HelpModal, { open: false, onClose: () => undefined }))).toBe("");
  });

  it("öğretici adımları TutorialSteps ile paylaşılır (tekilleştirme)", () => {
    const steps = renderToStaticMarkup(createElement(TutorialSteps));
    expect(TUTORIAL_STEPS).toHaveLength(6);
    expect(steps.match(/class="tut-step"/g)).toHaveLength(6);
    expect(steps).toContain("<h5>Filmi yakınlaştırın</h5>");
    expect(steps).toContain("<h5>Yorumlayın</h5>");
    expect(renderToStaticMarkup(createElement(HelpModal, { open: true, onClose: () => undefined }))).toContain(steps);
  });
});

describe("S8 ChromeModals seam uyumu", () => {
  it("S9 bileşenleri seam sözleşmelerini karşılar ve Header'a bağlanır", () => {
    const help: ComponentType<HelpModalSeamProps> = HelpModal;
    const confirm: ComponentType<ConfirmModalSeamProps> = ConfirmModal;
    const html = renderInStore(
      createElement(Fragment, null, createElement(Header, { modals: { help, confirm } }))
    );
    expect(html).toContain('aria-label="Yardım"');
    expect(html).toContain("eg-header");
    expect(html).not.toContain("modal-overlay");
  });
});

describe("sekme tuzağı ve belge sınırı (saf yardımcılar)", () => {
  it("Shift+Tab ilk öğeden sona, Tab son öğeden ilke sarar", () => {
    const first = { focus: () => undefined, hasAttribute: () => false };
    const last = { focus: () => undefined, hasAttribute: () => false };
    expect(tabTrapTarget(true, first, first, last)).toBe("last");
    expect(tabTrapTarget(false, last, first, last)).toBe("first");
    expect(tabTrapTarget(false, first, first, last)).toBeNull();
    expect(tabTrapTarget(true, last, first, last)).toBeNull();
    expect(tabTrapTarget(false, null, first, last)).toBeNull();
  });

  it("varsayılan belge sınırı güvenli no-op'tur", () => {
    const env = createNoopModalEnv();
    expect(env.activeElement).toBeNull();
    expect(env.queryFocusables(null, "button")).toEqual([]);
    expect(() => env.addEventListener("keydown", () => undefined)).not.toThrow();
    expect(() => env.removeEventListener("keydown", () => undefined)).not.toThrow();
  });
});
