/// <reference lib="dom" />
/**
 * T289 — Pulse mod seçiminin 4. kartı "Meydan Okuma" ve adil oyun kuralı.
 * Kaynak `renderModes` kartı öğrenme kilidiyle çizer; burada kabuğun sim içi
 * Meydan Okuma merkezine (`context.openChallenges`) bağlanır. Ziyaretçi kilidi
 * `audience.ts`'tedir; öğretim üyesi ve kanalsız mount'ta kart pasiftir.
 */
import { GAMI_FAIR_PLAY_TEXT } from "@egemed/gami-ui";
import { audienceOf } from "@egemed/sim-host";
import type { SimMountContext } from "@egemed/sim-host";
import type { PulseRuntimeHandle } from "./host";

const FACULTY_STATUS = "Karşılaşmalar yalnız öğrenciler içindir";

export function attachPulseChallengeCard(
  handle: PulseRuntimeHandle,
  context: Pick<SimMountContext, "audience" | "openChallenges">,
  /** Adil oyun kuralı yalnız oyunlaştırma çizilen öğrenciye gösterilir. */
  fairPlay: boolean,
): () => void {
  const shadow = handle.shadow;
  const box = shadow.getElementById("modeCards");
  if (box === null) return () => undefined;
  const doc = shadow.ownerDocument;
  const audience = audienceOf(context);
  const openChallenges = context.openChallenges;
  const cleanups: (() => void)[] = [];

  if (audience !== "visitor") {
    const apply = (): void => {
      const card = box.querySelector(".mode-card.challenge");
      const button = card?.querySelector<HTMLButtonElement>("button[data-view='challenge']");
      if (card == null || button == null) return;
      if (audience === "faculty" && card.querySelector(".eg-challenge-status") === null) {
        const status = doc.createElement("span");
        status.className = "eg-challenge-status";
        status.textContent = FACULTY_STATUS;
        card.querySelector(".mode-status")?.append(status);
      }
      if ((audience === "faculty" || openChallenges === undefined) && !button.disabled) button.disabled = true;
    };
    const onClick = (event: Event): void => {
      const target = event.target;
      const button = target instanceof Element ? target.closest<HTMLButtonElement>("button[data-view='challenge']") : null;
      if (button === null || !box.contains(button)) return;
      event.preventDefault();
      if (!button.disabled) openChallenges?.();
    };
    apply();
    const Observer = doc.defaultView?.MutationObserver;
    if (Observer !== undefined) {
      const observer = new Observer(apply);
      observer.observe(box, { childList: true });
      cleanups.push(() => observer.disconnect());
    }
    box.addEventListener("click", onClick);
    cleanups.push(() => box.removeEventListener("click", onClick));
  }

  if (fairPlay) {
    const fair = doc.createElement("div");
    fair.className = "eg-gami-fair";
    fair.setAttribute("role", "note");
    fair.innerHTML =
      '<span class="eg-gami-fair-ic" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></span>';
    const text = doc.createElement("p");
    const lead = doc.createElement("b");
    lead.textContent = "Adil oyun kuralı.";
    text.append(lead, ` ${GAMI_FAIR_PLAY_TEXT}`);
    fair.append(text);
    box.insertAdjacentElement("afterend", fair);
    cleanups.push(() => fair.remove());
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}
