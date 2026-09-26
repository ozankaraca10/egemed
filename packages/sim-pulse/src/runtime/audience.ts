/// <reference lib="dom" />
/**
 * Pulse kaynak runtime'ını kitle (öğrenci/öğretim üyesi/ziyaretçi) sözleşmesine
 * bağlar (T173, `@egemed/sim-host` T172 sözleşmesi). Kaynak betiklere
 * dokunulmaz (bkz. `host.ts`); mod kartları (`#modeCards`) ve İnceleme modu
 * ritim sekmeleri (`.rhythm-tab[data-mode]`) gölge kökte gözlemlenip
 * eklenen kilit rozeti/metniyle işaretlenir, tıklama yakalama evresinde
 * durdurulur (renk dışında ikon+metinle işaretli, klavye erişilebilir kalır).
 *
 * - **student**: hiçbir şey eklemez (bugünkü davranış aynen).
 * - **faculty**: kilit yok; yalnız mod seçiminin üstünde nötr bilgi notu.
 * - **visitor**: mod seçiminin üstünde rozet+uyarı+"Öğrenci girişi"; Uygulama
 *   ve Değerlendirme kartları kilitli (kart düğmesi "Öğrenci girişi" olur,
 *   `context.requestSignIn?.()` çağırır); İnceleme modunda yalnız
 *   `isVisitorUnlockedItem` `true` dönen ritimler açık, diğerleri kilitli
 *   (seçim engellenir, `VISITOR_LOCK_TEXT.itemLocked` duyurulur).
 */
import { VISITOR_LOCK_TEXT, audienceCanUseMode, audienceOf } from "@egemed/sim-host";
import type { SimAudience, SimMountContext } from "@egemed/sim-host";
import { isVisitorUnlockedItem } from "../access/visitorAccess";
import type { PulseRuntimeHandle } from "./host";

type ModeCardKind = "learn" | "practice" | "assessment";
const MODE_CARD_KINDS: readonly ModeCardKind[] = ["learn", "practice", "assessment"];

const FACULTY_NOTE = "Öğretim üyesi görünümü — rozet ve sıralama yalnız öğrenciler içindir.";

const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Gölge köke bir kez eklenen stil; yeni renk literali yok (mevcut tasarım token'ları). */
const AUDIENCE_STYLE = `
.egemed-pulse-audience-banner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;padding:10px 14px;border:1px solid var(--line,#cfdcee);border-radius:10px;background:var(--bg-grad-a,#eef4fb);color:var(--navy-900,#0a2a5e);font-size:14px}
.egemed-pulse-audience-banner .eg-badge{font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid var(--line,#cfdcee);background:#fff}
.egemed-pulse-audience-cta{min-height:44px;padding:0 14px;border:1px solid var(--line,#cfdcee);border-radius:10px;background:#fff;color:var(--blue-500,#0c6fdc);font:inherit;font-weight:700;cursor:pointer}
.egemed-pulse-audience-note{margin:0 0 12px;color:var(--ink-500,#536d95);font-size:13px}
.mode-card.eg-locked{opacity:.6}
.eg-lock-note{display:flex;align-items:center;gap:6px;color:var(--ink-500,#536d95);font-size:13px;margin:6px 0 0}
.rhythm-tab.eg-locked{opacity:.55}
.eg-lock-ic{margin-inline-end:6px}
.eg-lock-status{margin:6px 0 0;color:var(--ink-500,#536d95);font-size:13px;min-height:1em}
`;

const LOCK_ICON =
  '<svg class="eg-lock-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

function modeCardKind(card: Element): ModeCardKind | null {
  return MODE_CARD_KINDS.find((kind) => card.classList.contains(kind)) ?? null;
}

/** Görsel eksiği olmayan (gölge kökte tek sefer eklenen) kilit stilini kurar. */
function ensureStyle(shadow: ShadowRoot): void {
  if (shadow.getElementById("egemedPulseAudienceStyle") !== null) return;
  const doc = shadow.ownerDocument;
  const style = doc.createElement("style");
  style.id = "egemedPulseAudienceStyle";
  style.textContent = AUDIENCE_STYLE;
  shadow.append(style);
}

function insertBanner(shadow: ShadowRoot, audience: SimAudience, requestSignIn: (() => void) | undefined): (() => void) | null {
  const modeCards = shadow.getElementById("modeCards");
  const parent = modeCards?.parentElement ?? null;
  if (modeCards === null || parent === null) return null;
  const doc = shadow.ownerDocument;
  if (audience === "faculty") {
    const note = doc.createElement("p");
    note.className = "egemed-pulse-audience-note";
    note.textContent = FACULTY_NOTE;
    parent.insertBefore(note, modeCards);
    return () => note.remove();
  }
  if (audience === "visitor") {
    const banner = doc.createElement("div");
    banner.className = "egemed-pulse-audience-banner";
    banner.setAttribute("role", "note");
    banner.innerHTML =
      `<span class="eg-badge">${escapeHtml(VISITOR_LOCK_TEXT.badge)}</span>` +
      `<span>${escapeHtml(VISITOR_LOCK_TEXT.locked)}</span>`;
    if (requestSignIn !== undefined) {
      const cta = doc.createElement("button");
      cta.type = "button";
      cta.className = "egemed-pulse-audience-cta";
      cta.textContent = VISITOR_LOCK_TEXT.cta;
      cta.addEventListener("click", () => requestSignIn());
      banner.append(cta);
    }
    parent.insertBefore(banner, modeCards);
    return () => banner.remove();
  }
  return null;
}

/** Uygulama/Değerlendirme kartlarını kilitler; düğmesi "Öğrenci girişi" olur. */
function lockModeCards(shadow: ShadowRoot, requestSignIn: (() => void) | undefined): () => void {
  const box = shadow.getElementById("modeCards");
  if (box === null) return () => undefined;
  const doc = shadow.ownerDocument;

  const applyLocks = (): void => {
    for (const card of Array.from(box.querySelectorAll(".mode-card"))) {
      const kind = modeCardKind(card);
      if (kind === null || audienceCanUseMode("visitor", kind)) continue;
      card.classList.add("eg-locked");
      card.setAttribute("aria-disabled", "true");
      const button = card.querySelector("button[data-view]");
      if (button !== null && button.getAttribute("data-eg-locked") !== "1") {
        button.setAttribute("data-eg-locked", "1");
        button.innerHTML = `${LOCK_ICON}<span>${escapeHtml(VISITOR_LOCK_TEXT.cta)}</span>`;
      }
      if (card.querySelector(".eg-lock-note") === null) {
        const note = doc.createElement("p");
        note.className = "eg-lock-note";
        note.innerHTML = `${LOCK_ICON}<span>${escapeHtml(VISITOR_LOCK_TEXT.modeLocked)}</span>`;
        (card.querySelector(".desc") ?? card).insertAdjacentElement("afterend", note);
      }
    }
  };

  const onClickCapture = (event: Event): void => {
    const target = event.target;
    const button = target instanceof Element ? target.closest("button[data-view]") : null;
    if (button === null || !box.contains(button)) return;
    const card = button.closest(".mode-card");
    const kind = card === null ? null : modeCardKind(card);
    if (kind === null || audienceCanUseMode("visitor", kind)) return;
    event.preventDefault();
    event.stopPropagation();
    requestSignIn?.();
  };

  applyLocks();
  const observer = new MutationObserver(applyLocks);
  observer.observe(box, { childList: true, subtree: true });
  box.addEventListener("click", onClickCapture, true);

  return () => {
    observer.disconnect();
    box.removeEventListener("click", onClickCapture, true);
  };
}

/** İnceleme modunda ziyaretçiye kapalı ritimleri kilitler (T173, `visitorAccess`). */
function lockRhythmTabs(shadow: ShadowRoot): () => void {
  const doc = shadow.ownerDocument;
  const container = shadow.querySelector(".rhythm-tabs");
  if (container === null) return () => undefined;

  const status = doc.createElement("p");
  status.className = "eg-lock-status";
  status.setAttribute("aria-live", "polite");
  container.insertAdjacentElement("afterend", status);

  const applyLocks = (): void => {
    for (const tab of Array.from(container.querySelectorAll<HTMLElement>(".rhythm-tab[data-mode]"))) {
      const mode = tab.dataset.mode ?? "";
      if (isVisitorUnlockedItem(mode)) {
        tab.classList.remove("eg-locked");
        tab.removeAttribute("aria-disabled");
        tab.querySelector(".eg-lock-ic")?.remove();
        continue;
      }
      tab.classList.add("eg-locked");
      tab.setAttribute("aria-disabled", "true");
      if (tab.querySelector(".eg-lock-ic") === null) {
        tab.insertAdjacentHTML("afterbegin", LOCK_ICON);
      }
    }
  };

  const onClickCapture = (event: Event): void => {
    const target = event.target;
    const tab = target instanceof Element ? target.closest<HTMLElement>(".rhythm-tab[data-mode]") : null;
    if (tab === null || !container.contains(tab)) return;
    const mode = tab.dataset.mode ?? "";
    if (isVisitorUnlockedItem(mode)) return;
    event.preventDefault();
    event.stopPropagation();
    status.textContent = VISITOR_LOCK_TEXT.itemLocked;
  };

  applyLocks();
  const observer = new MutationObserver(applyLocks);
  observer.observe(container, { childList: true, subtree: true });
  container.addEventListener("click", onClickCapture, true);

  return () => {
    observer.disconnect();
    container.removeEventListener("click", onClickCapture, true);
    status.remove();
  };
}

/** Bağlar; dönen işlev eklenen tüm DOM/gözlemleri kaldırır (idempotent). */
export function attachPulseAudience(
  handle: PulseRuntimeHandle,
  context: Pick<SimMountContext, "audience" | "requestSignIn">,
): () => void {
  const audience = audienceOf(context);
  if (audience === "student") return () => undefined;

  const shadow = handle.shadow;
  ensureStyle(shadow);
  const cleanups: (() => void)[] = [];
  const removeBanner = insertBanner(shadow, audience, context.requestSignIn);
  if (removeBanner !== null) cleanups.push(removeBanner);
  if (audience === "visitor") {
    cleanups.push(lockModeCards(shadow, context.requestSignIn));
    cleanups.push(lockRhythmTabs(shadow));
  }

  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    for (const cleanup of cleanups) cleanup();
  };
}
