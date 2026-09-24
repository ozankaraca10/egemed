import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ConfirmModal,
  HelpModal,
  PediatricRefModal,
  TUTORIAL_STEPS,
  TutorialSteps,
  bindModalFocus,
  createNoopModalEnv,
  enabledFocusables,
  tabTrapTarget,
} from "../../packages/sim-ausculta/src/index";
import type { ModalFocusable, ModalKeyEvent } from "../../packages/sim-ausculta/src/index";

/** Modaller — statik işaretleme ve sahte belge sınırı. DOM kütüphanesi yok. */

function focusable(): ModalFocusable & { focused: number } {
  return { focused: 0, focus() { this.focused += 1; }, hasAttribute: () => false };
}

function key(name: string, shiftKey = false): ModalKeyEvent & { prevented: boolean } {
  return { key: name, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
}

function envWith(active: ModalFocusable | null, found: ModalFocusable[]) {
  const listeners = new Set<(event: ModalKeyEvent) => void>();
  let current = active;
  return {
    listeners,
    setActive(next: ModalFocusable | null) { current = next; },
    env: {
      get activeElement() { return current; },
      addEventListener(_type: "keydown", handler: (event: ModalKeyEvent) => void) { listeners.add(handler); },
      removeEventListener(_type: "keydown", handler: (event: ModalKeyEvent) => void) { listeners.delete(handler); },
      queryFocusables: () => found,
    },
  };
}

describe("Ausculta ConfirmModal", () => {
  const props = {
    open: true,
    title: "Değerlendirmeden çıkılsın mı?",
    message: "İlerlemeniz kaydedilir, oturum devam ettirilebilir.",
    onConfirm: () => undefined,
    onCancel: () => undefined,
  };

  it("dialog rolü, başlık ve varsayılan eylemleri çizer", () => {
    const html = renderToStaticMarkup(createElement(ConfirmModal, props));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Değerlendirmeden çıkılsın mı?"');
    expect(html).toContain("<h3>Değerlendirmeden çıkılsın mı?</h3>");
    expect(html).toContain("İlerlemeniz kaydedilir, oturum devam ettirilebilir.");
    expect(html).toContain("confirm-modal");
    expect(html).toContain(">Çık</button>");
    expect(html).toContain(">Vazgeç</button>");
    expect(html).toContain("min-width:44px");
    expect(html).toContain("min-height:44px");
  });

  it("kapalıyken boştur; etiketler özelleşir", () => {
    expect(renderToStaticMarkup(createElement(ConfirmModal, { ...props, open: false }))).toBe("");
    const html = renderToStaticMarkup(createElement(ConfirmModal, { ...props, confirmLabel: "Sil", cancelLabel: "Dur" }));
    expect(html).toContain(">Sil</button>");
    expect(html).toContain(">Dur</button>");
  });
});

describe("Ausculta HelpModal", () => {
  it("başlık, kapatma ve ipuçlarını çizer; öğretici adımları paylaşır", () => {
    const html = renderToStaticMarkup(createElement(HelpModal, { open: true, onClose: () => undefined }));
    const steps = renderToStaticMarkup(createElement(TutorialSteps));
    expect(html).toContain('aria-label="Yardım"');
    expect(html).toContain("<h3>Nasıl Kullanılır?</h3>");
    expect(html).toContain('aria-label="Yardım penceresini kapat"');
    expect(html).toContain("help-tips");
    expect(html).toContain("kulaklık kullanın");
    expect(html).toContain("Bu simülatör eğitim amaçlıdır; tanı koydurmaz.");
    expect(html).toContain(steps);
    expect(TUTORIAL_STEPS[0]?.title).toBe("Stetoskopu sürükleyin");
    expect(renderToStaticMarkup(createElement(HelpModal, { open: false, onClose: () => undefined }))).toBe("");
  });
});

describe("Ausculta PediatricRefModal", () => {
  it("yaş tablosunu ve oskültasyon notlarını çizer", () => {
    const html = renderToStaticMarkup(createElement(PediatricRefModal, { open: true, onClose: () => undefined }));
    expect(html).toContain('aria-label="Pediatrik referans değerleri"');
    expect(html).toContain('aria-label="Pediatrik referans penceresini kapat"');
    expect(html).toContain("<th>Kalp hızı</th>");
    expect(html).toContain("Yenidoğan (0–1 ay)");
    expect(html).toContain("100–180/dk");
    expect(html).toContain("30–60/dk");
    expect(html).toContain("Adölesan (12–18 yaş)");
    expect(html).toContain("ped-notes");
    expect(html).toContain("S3 çocuklarda sıklıkla fizyolojiktir");
    expect(renderToStaticMarkup(createElement(PediatricRefModal, { open: false, onClose: () => undefined }))).toBe("");
  });
});

describe("modal odak tuzağı", () => {
  it("Shift+Tab ilk öğeden sona, Tab son öğeden ilke sarar", () => {
    const first = focusable();
    const last = focusable();
    expect(tabTrapTarget(true, first, first, last)).toBe("last");
    expect(tabTrapTarget(false, last, first, last)).toBe("first");
    expect(tabTrapTarget(false, first, first, last)).toBeNull();
    expect(tabTrapTarget(true, last, first, last)).toBeNull();
  });

  it("açılışta ilk odağı alır, Esc kapatır, kapanış önceki odağa döner", () => {
    const trigger = focusable();
    const close = focusable();
    const other = focusable();
    const host = envWith(trigger, [close, other]);
    const onDismiss = vi.fn();
    const release = bindModalFocus({
      env: host.env,
      initial: close,
      focusables: () => [close, other],
      onDismiss,
    });
    expect(close.focused).toBe(1);
    host.setActive(other);
    const tab = key("Tab");
    for (const listener of host.listeners) listener(tab);
    expect(tab.prevented).toBe(true);
    expect(close.focused).toBe(2);
    const esc = key("Escape");
    for (const listener of host.listeners) listener(esc);
    expect(esc.prevented).toBe(true);
    expect(onDismiss).toHaveBeenCalledOnce();
    release();
    expect(trigger.focused).toBe(1);
    expect(host.listeners.size).toBe(0);
  });

  it("devre dışı öğeleri eler; no-op sınır fırlatmaz", () => {
    const live = focusable();
    const dead = { ...focusable(), hasAttribute: (name: string) => name === "disabled" };
    const host = envWith(null, [dead, live]);
    expect(enabledFocusables(host.env, {}, "button")).toEqual([live]);
    const env = createNoopModalEnv();
    expect(env.activeElement).toBeNull();
    expect(env.queryFocusables(null, "button")).toEqual([]);
    expect(() => env.addEventListener("keydown", () => undefined)).not.toThrow();
    expect(() => env.removeEventListener("keydown", () => undefined)).not.toThrow();
  });
});
