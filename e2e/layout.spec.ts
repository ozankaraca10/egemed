import { expect, test } from "@playwright/test";
import { openRoute, ROUTES, trackErrors } from "./helpers";

interface LayoutAudit {
  broken: string[];
  h1: number;
  missingAlt: string[];
  overflow: boolean;
  small: string[];
}

test.describe("yerleşim denetimi", () => {
  for (const route of ROUTES) {
    test(`${route.label} (${route.hash})`, async ({ page }) => {
      const errors = trackErrors(page);
      await openRoute(page, route.hash);

      const audit = await page.evaluate((): LayoutAudit => {
        const root = document.documentElement;
        const overflow = root.scrollWidth > window.innerWidth + 1;
        const small: string[] = [];
        const interactive =
          "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";
        for (const element of document.querySelectorAll<HTMLElement>(interactive)) {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          if (rect.width === 0 || rect.height === 0 || style.visibility === "hidden") continue;
          // Atlama bağlantısı odaklanana dek gizli kalır; 44 px kuralından muaftır.
          if (element.classList.contains("eg-shell-skip")) continue;
          // Gömülü sim modülü (T14c: Opaca) kendi a11y/dokunma hedefi sözleşmesini
          // kendi paketinde taşır; kabuk denetimi yalnız kendi arayüzünü kapsar.
          if (element.closest(".eg-shell-sim-page__host") !== null) continue;
          const label = `${element.tagName.toLowerCase()}.${element.className} ${Math.round(
            rect.width,
          )}x${Math.round(rect.height)}`;
          const tooSmall =
            element.tagName === "INPUT" ? rect.height < 44 : rect.width < 44 || rect.height < 44;
          if (tooSmall) small.push(label);
        }
        // Gömülü sim modülünün (T14c: Opaca) kendi görselleri kendi paketinin
        // sorumluluğundadır; kabuk denetimi yalnız kendi arayüzünü kapsar
        // (bkz. yukarıdaki dokunma hedefi muafiyetiyle aynı gerekçe).
        const images = [...document.images].filter(
          (image) => image.closest(".eg-shell-sim-page__host") === null,
        );
        return {
          broken: images.filter((image) => image.complete && image.naturalWidth === 0).map(
            (image) => image.currentSrc,
          ),
          h1: document.querySelectorAll("h1").length,
          missingAlt: images.filter((image) => !image.hasAttribute("alt")).map((image) => image.currentSrc),
          overflow,
          small,
        };
      });

      expect(audit.overflow, "yatay kaydırma").toBe(false);
      expect(audit.small, "44 px altı dokunma hedefi").toEqual([]);
      expect(audit.h1, "tek h1").toBe(1);
      expect(audit.missingAlt, "alt'sız görsel").toEqual([]);
      expect(audit.broken, "kırık görsel").toEqual([]);
      expect(errors, "konsol/sayfa hatası").toEqual([]);
    });
  }
});
