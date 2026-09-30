import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { captureRouteScreenshot, writeAxeArtifact } from "./artifacts";
import { clickSimBarAction, trackErrors } from "./helpers";
import { completeTopicPractice, giveAnswer, startTopicPractice, submitAnswer, unlockAuscultaLearn, unlockOpacaLearn, type SimId } from "./sim-flows";
import auscultaAllowlistJson from "./ausculta-a11y-allowlist.json" with { type: "json" };
import opacaAllowlistJson from "./opaca-a11y-allowlist.json" with { type: "json" };


/**
 * T116: Opaca ve Ausculta iç ekranlarında erişilebilirlik kapısı. Birebir desen:
 * e2e/pulse-a11y.spec.ts + pulse-a11y-allowlist.json (T102). Bu iki sim gölge
 * DOM değil açık React ağacı olduğundan kaydırma/ölçüm yardımcıları açık DOM'a
 * uyarlanmıştır; kural kümesi aynıdır.
 *
 * Her ekran 360/768/1440 projelerinde `.include(sim kökü)` ile WCAG 2.2 AA axe
 * taramasından geçer ve 44 px altındaki görünür dokunma hedefleri ölçülür.
 * Kaynaktan devralınmış ihlaller `opaca-a11y-allowlist.json` /
 * `ausculta-a11y-allowlist.json` ile izinlidir; liste yalnız küçülür: izin
 * listesinde olmayan bir ihlal/küçük hedef başarısızlıktır, artık oluşmayan bir
 * kayıt da "düzeltildi — listeden çıkar" diye başarısız olur. Her ekran axe
 * JSON'u ve tam sayfa ekran görüntüsü artefaktı üretir.
 *
 * Ekran notları (plan §3, T116b güncellemesi):
 * - Birleşik bardaki ilerleme eylemi "İlerlemem"dir; açtığı sayfa @egemed/gami-ui
 *   GamiProgressPage'tir (sekmeler: Başarılarım / Liderlik Tahtası, role=tab).
 * - Değerlendirme ekranı (Opaca): "İlerlemem" sayfasındaki boş durum kartındaki
 *   "Değerlendirmeye gir" ile açılır; oturum yanıtlanmaz.
 * - Değerlendirme ekranı (Ausculta): bu kapı kapsamaz. Mod kartlarındaki öneri
 *   kilidi `tutorialSeen` bekler; gömülü modda öğretici açılmaz (App yalnız
 *   bağımsız modda yönlendirir) ve boş-durum değerlendirme girişi yoktur.
 *   UI yolu geldiğinde ekran bu spec'e eklenecek; sessiz atlama değildir.
 * - Ses/görüntü varlıkları git-dışıdır (`sync:audio`/`sync:xray`) ve bu
 *   çalışma ortamında yoktur. Opaca filmleri "görüntü dosyası yüklenemedi"
 *   boş alanıyla, Ausculta sesleri çalınamadan ekranlar tutarlı çalışır; kapı
 *   ekranın tam akışını (kütüphane → uygulama → sonuç) bu durumdayken doğrular.
 * - Sonuç ekranı en kısa yoldan açılır: öğrenme ekranındaki konu uygulaması
 *   (5 vakalık oturum) tamamlandığında "Vaka Raporu" görünür. Değerlendirme
 *   oturumu (10 vaka) süre sınırlarıyla kapıyı şişirir; kullanılmaz. Uzun
 *   akış kapı bütçesini şişirdiği için sonuç ekranı yalnız desktop-1440
 *   projesinde taranır (T116b §3); kısa ekranlar üç genişlikte kalır.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const MIN_TARGET_PX = 44;
/**
 * axe `target-size` (WCAG 2.2 AA 24 px) komşu öğelerin görüntü alanındaki
 * durumuna göre kararsız sonuç veriyor; aynı öğeler 44 px ölçümünde (daha
 * katı) izin listesinde izleniyor.
 */
const DISABLED_RULES = ["target-size"];

type ScreenId = "modes" | "learn" | "case" | "assessment" | "results" | "gami" | "help";

interface AllowlistViolation {
  screen: ScreenId;
  rule: string;
  target: string;
  projects?: string[];
}

interface AllowlistSmallTarget {
  screen: ScreenId;
  selector: string;
  size: string;
  projects?: string[];
}

interface SimsA11yAllowlist {
  note: string;
  violations: AllowlistViolation[];
  smallTargets: AllowlistSmallTarget[];
}

interface Screen {
  id: ScreenId;
  label: string;
  route: string;
  open(root: Locator): Promise<void>;
}

interface ObservedViolation {
  rule: string;
  target: string;
  /** Tek taramada görülen en fazla düğüm sayısı. */
  count: number;
  help: string;
  impact: string | null;
}

interface SimConfig {
  id: SimId;
  rootSelector: string;
  entryHeading: string;
  allowlist: SimsA11yAllowlist;
  screens: readonly Screen[];
}

const OPACA_ALLOWLIST = opacaAllowlistJson as SimsA11yAllowlist;
const AUSCULTA_ALLOWLIST = auscultaAllowlistJson as SimsA11yAllowlist;

/**
 * Seçicilerdeki koşuya göre değişen parçalar normalleştirilir: sıra numaraları,
 * durum sınıfları ve örneklenen vaka/konu sınıf adları. Böylece izin listesi
 * imleci koşular arasında kararlı kalır.
 */
function normalizeSelector(selector: string): string {
  return selector
    .replace(/:nth-of-type\(\d+\)/g, ":nth-of-type(*)")
    .replace(/:nth-child\(\d+\)/g, ":nth-child(*)")
    .replace(/\[(?:title|aria-current)="[^"]*"\]/g, "")
    .replace(/\.(?:is-[a-z-]+|selected|active|done|now|case-flash|has-mark)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Axe hedefi gölge kök zinciri olabilir; en içteki seçici karşılaştırma anahtarıdır. */
function rawSelector(target: unknown): string {
  let current: unknown = target;
  while (Array.isArray(current)) current = current[current.length - 1];
  return typeof current === "string" ? current : String(current);
}

function deepSelector(target: unknown): string {
  return normalizeSelector(rawSelector(target));
}

const ROOT_BY_SIM: Readonly<Record<SimId, string>> = {
  opaca: ".eg-sim-opaca",
  ausculta: ".eg-sim-ausculta",
};

/** Sim rotasını açar; birleşik bar devredeyken mod seçimi ilk ekrandır. */
async function openSim(page: Page, sim: SimConfig): Promise<Locator> {
  await page.goto(`/#/sims/${sim.id}`);
  const root = page.locator(ROOT_BY_SIM[sim.id]).first();
  await expect(root).toBeVisible();
  await expect(page.getByRole("heading", { name: sim.entryHeading })).toBeVisible();
  return root;
}

/** Birleşik bardaki sim eylemini tıklatır (T108: sim araç çubuğu yoktur). */
async function openSimBarAction(root: Locator, label: string): Promise<void> {
  await clickSimBarAction(root.page(), label);
}


/**
 * Aktif ekranın kaydırma kabını bulur; modal açıkken yalnız kartı kaydırır
 * (emsalin gölge kök yürüyüşünün açık DOM karşılığı).
 */
async function scrollSim(page: Page, sim: SimId, offset?: number): Promise<number> {
  return page.evaluate(
    ({ rootSelector, target }) => {
      const root = document.querySelector(rootSelector);
      const modalCard = root?.querySelector(".modal-overlay")
        ? (root.querySelector(".modal-card") as Element | null)
        : null;
      const isScrollable = (node: Element): boolean => {
        const style = getComputedStyle(node);
        return /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      };
      if (modalCard !== null) {
        const max = modalCard.scrollHeight - modalCard.clientHeight;
        if (target !== null && isScrollable(modalCard)) modalCard.scrollTop = target;
        return Math.max(0, max);
      }
      let node: Element | null = root?.querySelector(".screen") ?? root;
      while (node !== null) {
        if (isScrollable(node)) {
          if (target !== null) node.scrollTop = target;
          return node.scrollHeight - node.clientHeight;
        }
        node = node.parentElement;
      }
      const scroller = document.scrollingElement ?? document.documentElement;
      if (target !== null) scroller.scrollTop = target;
      return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    },
    { rootSelector: ROOT_BY_SIM[sim], target: offset ?? null },
  );
}

/**
 * Renk karşıtlığı yalnız tamamen görünür öğeler için güvenilirdir; kırpılan
 * öğelerde axe arka planı yanlış örnekleyebildiği için ölçüm kararsızlaşır.
 */
async function fullyVisibleSelectors(
  page: Page,
  sim: SimId,
  selectors: readonly string[],
): Promise<Set<string>> {
  if (selectors.length === 0) return new Set();
  const visible = await page.evaluate(
    ({ rootSelector, candidates }) => {
      const root = document.querySelector(rootSelector);
      return candidates.map((selector) => {
        try {
          const element = root?.querySelector(selector) ?? document.querySelector(selector);
          if (element === null) return false;
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= -0.5 &&
            rect.left >= -0.5 &&
            rect.bottom <= window.innerHeight + 0.5 &&
            rect.right <= window.innerWidth + 0.5
          );
        } catch {
          return false;
        }
      });
    },
    { rootSelector: ROOT_BY_SIM[sim], candidates: selectors },
  );
  return new Set(selectors.filter((_, index) => visible[index] === true));
}

/**
 * Ekran kaydırılırken axe tekrarlanır; görüntü alanı dışındaki öğeler axe'ta
 * "incomplete" döndüğü için tarama kaydırma boyunca birleştirilir.
 */
async function collectViolations(page: Page, sim: SimId): Promise<Map<string, ObservedViolation>> {
  const observed = new Map<string, ObservedViolation>();
  const max = await scrollSim(page, sim);
  const viewportHeight = page.viewportSize()?.height ?? 900;
  const step = Math.max(200, Math.round(viewportHeight * 0.6));
  for (let offset = 0; offset <= max + step; offset += step) {
    await scrollSim(page, sim, Math.min(offset, max));
    await page.waitForTimeout(60);
    const results = await new AxeBuilder({ page })
      .include(ROOT_BY_SIM[sim])
      .withTags([...TAGS])
      .disableRules([...DISABLED_RULES])
      .analyze();
    const contrastSelectors = results.violations
      .filter((violation) => violation.id === "color-contrast")
      .flatMap((violation) => violation.nodes.map((node) => rawSelector(node.target)));
    const visibleContrast = await fullyVisibleSelectors(page, sim, contrastSelectors);
    const scanCounts = new Map<string, ObservedViolation>();
    for (const violation of results.violations) {
      for (const node of violation.nodes) {
        if (violation.id === "color-contrast" && !visibleContrast.has(rawSelector(node.target))) continue;
        const target = deepSelector(node.target);
        const key = `${violation.id}|${target}`;
        const counted = scanCounts.get(key);
        if (counted === undefined) {
          scanCounts.set(key, {
            rule: violation.id,
            target,
            count: 1,
            help: violation.help,
            impact: violation.impact ?? null,
          });
        } else {
          counted.count += 1;
        }
      }
    }
    for (const [key, entry] of scanCounts) {
      const existing = observed.get(key);
      if (existing === undefined) observed.set(key, entry);
      else existing.count = Math.max(existing.count, entry.count);
    }
  }
  await scrollSim(page, sim, 0);
  return observed;
}

/** Görünür button/input/select/a öğelerinden 44 px altında kalanları ölçer. */
async function collectSmallTargets(page: Page, sim: SimId): Promise<Map<string, string>> {
  const measured = await page.evaluate(
    ({ rootSelector, min }) => {
      const root = document.querySelector(rootSelector);
      if (root === null) return [] as { selector: string; size: string; area: number }[];
      const modalCard = root.querySelector(".modal-overlay")
        ? (root.querySelector(".modal-card") as Element | null)
        : null;
      const scope: Element = modalCard ?? root;
      const pathOf = (element: Element): string => {
        const parts: string[] = [];
        let node: Element | null = element;
        while (node !== null && node !== scope) {
          let part = node.tagName.toLowerCase();
          if (node.id.length > 0) {
            parts.unshift(`#${node.id}`);
            break;
          }
          const classes =
            typeof node.className === "string" ? node.className.trim().split(/\s+/).filter(Boolean) : [];
          if (classes.length > 0) part += `.${classes.slice(0, 2).join(".")}`;
          const parent = node.parentElement;
          if (parent !== null) {
            const siblings = Array.from(parent.children).filter((child) => child.tagName === node?.tagName);
            if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
          }
          parts.unshift(part);
          node = node.parentElement;
        }
        return parts.join(" > ");
      };
      const out: { selector: string; size: string; area: number }[] = [];
      for (const element of scope.querySelectorAll("button, input, select, a")) {
        if (!(element instanceof HTMLElement)) continue;
        if (!element.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (rect.width >= min && rect.height >= min) continue;
        out.push({
          selector: pathOf(element),
          size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          area: rect.width * rect.height,
        });
      }
      return out;
    },
    { rootSelector: ROOT_BY_SIM[sim], min: MIN_TARGET_PX },
  );

  const smallest = new Map<string, { size: string; area: number }>();
  for (const entry of measured) {
    const selector = normalizeSelector(entry.selector);
    const previous = smallest.get(selector);
    if (previous === undefined || entry.area < previous.area) smallest.set(selector, entry);
  }
  return new Map([...smallest].map(([selector, entry]) => [selector, entry.size]));
}

function appliesToProject(entry: { projects?: string[] }, project: string): boolean {
  return entry.projects === undefined || entry.projects.includes(project);
}

const OPACA_SCREENS: readonly Screen[] = [
  {
    id: "modes",
    label: "Mod seçimi",
    route: "#/sims/opaca/modlar",
    async open() {
      // openSim mod seçiminin görünürlüğünü bekledi.
    },
  },
  {
    id: "gami",
    label: "İlerlemem (boş durum)",
    route: "#/sims/opaca/ilerlemem",
    async open(root) {
      await openSimBarAction(root, "İlerlemem");
      await expect(root.getByRole("tab", { name: "Başarılarım" })).toBeVisible();
      await expect(root.locator(".eg-gami-empty")).toBeVisible();
    },
  },
  {
    id: "assessment",
    label: "Değerlendirme",
    route: "#/sims/opaca/degerlendirme",
    async open(root) {
      await openSimBarAction(root, "İlerlemem");
      await expect(root.locator(".eg-gami-empty")).toBeVisible();
      await root.locator(".eg-gami-empty").getByRole("button", { name: "Değerlendirmeye gir" }).click();
      await expect(root.locator(".strict-banner")).toBeVisible();
    },
  },
  {
    id: "learn",
    label: "Öğrenme (kütüphane)",
    route: "#/sims/opaca/ogrenme",
    async open(root) {
      await root.locator(".mode-card.learn button.btn").first().click();
      await expect(root.locator(".lib-col")).toBeVisible();
    },
  },
  {
    id: "case",
    label: "Uygulama (bir yanıt verilmiş)",
    route: "#/sims/opaca/uygulama",
    async open(root) {
      await startTopicPractice(root);
      await giveAnswer(root, "opaca");
      await submitAnswer(root);
    },
  },
  {
    id: "results",
    label: "Sonuç (konu oturumu bitince)",
    route: "#/sims/opaca/sonuc",
    async open(root) {
      await startTopicPractice(root);
      await completeTopicPractice(root, "opaca");
      await expect(root.page().getByRole("heading", { name: "Vaka Raporu", exact: true })).toBeVisible();
    },
  },
  {
    id: "help",
    label: "Yardım modalı",
    route: "#/sims/opaca/yardim",
    async open(root) {
      await openSimBarAction(root, "Yardım");
      await expect(root.getByRole("dialog", { name: "Yardım" })).toBeVisible();
    },
  },
];

const AUSCULTA_SCREENS: readonly Screen[] = [
  {
    id: "modes",
    label: "Mod seçimi",
    route: "#/sims/ausculta/modlar",
    async open() {
      // openSim mod seçiminin görünürlüğünü bekledi.
    },
  },
  {
    id: "learn",
    label: "Öğrenme (kütüphane)",
    route: "#/sims/ausculta/ogrenme",
    async open(root) {
      await root.locator(".mode-card.learn button.btn").first().click();
      // Kütüphane başlığı (h2) kaynağın mobil düzeninde gizlidir (T133) — görünür ilk kayıt yeterli.
      await expect(root.locator(".lib-col .lib-item").first()).toBeVisible();
    },
  },
  {
    id: "case",
    label: "Uygulama (bir yanıt verilmiş)",
    route: "#/sims/ausculta/uygulama",
    async open(root) {
      await startTopicPractice(root);
      await giveAnswer(root, "ausculta");
      await submitAnswer(root);
    },
  },
  {
    id: "results",
    label: "Sonuç (konu oturumu bitince)",
    route: "#/sims/ausculta/sonuc",
    async open(root) {
      await startTopicPractice(root);
      await completeTopicPractice(root, "ausculta");
      await expect(root.page().getByRole("heading", { name: "Vaka Raporu", exact: true })).toBeVisible();
    },
  },
  {
    id: "gami",
    label: "İlerlemem",
    route: "#/sims/ausculta/ilerlemem",
    async open(root) {
      await openSimBarAction(root, "İlerlemem");
      await expect(root.getByRole("tab", { name: "Başarılarım" })).toBeVisible();
    },
  },
  {
    id: "help",
    label: "Yardım modalı",
    route: "#/sims/ausculta/yardim",
    async open(root) {
      await openSimBarAction(root, "Yardım");
      await expect(root.getByRole("dialog", { name: "Yardım" })).toBeVisible();
    },
  },
];

const SIMS: readonly SimConfig[] = [
  {
    id: "opaca",
    rootSelector: ROOT_BY_SIM.opaca,
    entryHeading: "Çalışma Modunu Seçin",
    allowlist: OPACA_ALLOWLIST,
    screens: OPACA_SCREENS,
  },
  {
    id: "ausculta",
    rootSelector: ROOT_BY_SIM.ausculta,
    entryHeading: "Çalışma Modunu Seçin",
    allowlist: AUSCULTA_ALLOWLIST,
    screens: AUSCULTA_SCREENS,
  },
];

/**
 * Uzun akışlı ekranlar: 5 vakalık konu oturumunu uçtan uca çözdükleri için
 * yalnız desktop-1440 projesinde taranır (T116b §3: spec toplamı ≤ 6 dk).
 * Kısa ekranlar üç genişlikte kalmaya devam eder.
 */
const LONG_SCREENS: readonly ScreenId[] = ["results"];

for (const sim of SIMS) {
  test.describe(`${sim.id} iç ekran erişilebilirliği (WCAG 2.2 AA + 44 px)`, () => {
    test.describe.configure({ timeout: 180_000 });

    for (const screen of sim.screens) {
      test(`${screen.label} (${screen.route})`, async ({ page }, testInfo: TestInfo) => {
        if (LONG_SCREENS.includes(screen.id)) {
          // Sonuç akışı tek genişlikte yeterli: 5 vakalık oturum her genişlikte
          // koşulursa kapı bütçesi (T116b §3) şişer; kısa ekranlar üç genişlikte.
          test.skip(testInfo.project.name !== "desktop-1440", "sonuç akışı yalnız desktop-1440 (kapı bütçesi)");
        }
        const errors = trackErrors(page);
        // T209/T218: Ausculta ve Opaca'da uygulama/değerlendirme akışı öğrenme
        // tamamlanmadan kilitlidir; ekran kapısı öğrenmeyi tamamlanmış sayarak akışı açar.
        if (sim.id === "ausculta") await unlockAuscultaLearn(page);
        if (sim.id === "opaca") await unlockOpacaLearn(page);
        const root = await openSim(page, sim);
        await screen.open(root);

        const smallTargets = await collectSmallTargets(page, sim.id);
        await captureRouteScreenshot(page, testInfo.project.name, screen.route);
        const violations = await collectViolations(page, sim.id);

        const byRule = new Map<string, { help: string; impact: string | null; targets: string[] }>();
        for (const item of violations.values()) {
          const label = item.count > 1 ? `${item.target} (x${item.count})` : item.target;
          const group = byRule.get(item.rule);
          if (group === undefined) {
            byRule.set(item.rule, { help: item.help, impact: item.impact, targets: [label] });
          } else {
            group.targets.push(label);
          }
        }
        await writeAxeArtifact(
          testInfo.project.name,
          screen.route,
          [...byRule].map(([id, group]) => ({
            help: group.help,
            id,
            impact: group.impact,
            targets: group.targets.sort(),
          })),
        );

        expect(errors, `${screen.id}: konsol/sayfa hataları`).toEqual([]);

        const project = testInfo.project.name;
        const unlistedViolations = [...violations.values()]
          .filter(
            (item) =>
              !sim.allowlist.violations.some(
                (entry) =>
                  entry.screen === screen.id &&
                  appliesToProject(entry, project) &&
                  entry.rule === item.rule &&
                  entry.target === item.target,
              ),
          )
          .map((item) => `${item.rule} | ${item.target}`);
        expect(unlistedViolations, `${screen.id}: izin listesinde olmayan axe ihlalleri`).toEqual([]);

        const fixedViolations = sim.allowlist.violations
          .filter(
            (entry) =>
              entry.screen === screen.id &&
              appliesToProject(entry, project) &&
              !violations.has(`${entry.rule}|${entry.target}`),
          )
          .map((entry) => `${entry.rule} | ${entry.target} — düzeltildi, listeden çıkar`);
        expect(fixedViolations, `${screen.id}: artık oluşmayan izinli ihlaller`).toEqual([]);

        const unlistedSmallTargets = [...smallTargets]
          .filter(
            ([selector]) =>
              !sim.allowlist.smallTargets.some(
                (entry) =>
                  entry.screen === screen.id && appliesToProject(entry, project) && entry.selector === selector,
              ),
          )
          .map(([selector, size]) => `${selector} | ${size}`);
        expect(unlistedSmallTargets, `${screen.id}: izin listesinde olmayan <${MIN_TARGET_PX}px hedefler`).toEqual(
          [],
        );

        const fixedSmallTargets = sim.allowlist.smallTargets
          .filter(
            (entry) =>
              entry.screen === screen.id &&
              appliesToProject(entry, project) &&
              !smallTargets.has(entry.selector),
          )
          .map((entry) => `${entry.selector} | ${entry.size} — düzeltildi, listeden çıkar`);
        expect(fixedSmallTargets, `${screen.id}: artık oluşmayan izinli küçük hedefler`).toEqual([]);
      });
    }
  });
}
