import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { curriculum } from "../packages/sim-pulse/src/data/curriculum";
import { captureRouteScreenshot, writeAxeArtifact } from "./artifacts";
import { clickSimBarAction, trackErrors } from "./helpers";
import { answerPulseCase, completePulseQuiz } from "./pulse-flows";
import allowlist from "./pulse-a11y-allowlist.json" with { type: "json" };

/**
 * PULSE-10 + TEST-01: Pulse kaynak runtime'ının (kök `.egemed-pulse-runtime`)
 * iç ekranlarında erişilebilirlik kapısı.
 *
 * Her ekran 360/768/1440 projelerinde WCAG 2.2 AA axe taramasından geçer ve
 * 44 px altındaki görünür dokunma hedefleri ölçülür. Kaynaktan devralınmış
 * ihlaller `pulse-a11y-allowlist.json` ile izinlidir; liste yalnız küçülür:
 * izin listesinde olmayan bir ihlal/küçük hedef başarısızlıktır, artık
 * oluşmayan bir kayıt da "düzeltildi — listeden çıkar" diye başarısız olur.
 * Her ekran axe JSON'u ve tam sayfa ekran görüntüsü artefaktı üretir.
 */
const ROOT = ".egemed-pulse-runtime";
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];
const MIN_TARGET_PX = 44;
/**
 * axe `target-size` (WCAG 2.2 AA 24 px) komşu öğelerin görüntü alanındaki
 * durumuna göre kararsız sonuç veriyor; aynı öğeler 44 px ölçümünde (daha
 * katı) izin listesinde izleniyor.
 */
const DISABLED_RULES = ["target-size"];

type ScreenId = "sim" | "case" | "quiz" | "results" | "gami";

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

interface PulseA11yAllowlist {
  note: string;
  violations: AllowlistViolation[];
  smallTargets: AllowlistSmallTarget[];
}

interface PulseScreen {
  id: ScreenId;
  label: string;
  route: string;
  readonly seed?: PulseSeedOptions;
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

const ALLOWLIST = allowlist as PulseA11yAllowlist;

/**
 * Seçicilerdeki koşuya göre değişen parçalar normalleştirilir: sıra numaraları,
 * durum sınıfları ve rastgele örneklenen soru kimlikleri. Böylece izin listesi
 * imleci koşular arasında kararlı kalır.
 */
function normalizeSelector(selector: string): string {
  return selector
    .replace(/:nth-of-type\(\d+\)/g, ":nth-of-type(*)")
    .replace(/\.(?:is-active|is-correct|is-wrong|is-locked|active|selected|now|done)\b/g, "")
    .replace(/Q\d{3}/g, "Q*");
}

/** Axe hedefi gölge kök zinciridir; en içteki seçici karşılaştırma anahtarıdır. */
function rawSelector(target: unknown): string {
  let current: unknown = target;
  while (Array.isArray(current)) current = current[current.length - 1];
  return typeof current === "string" ? current : String(current);
}

function deepSelector(target: unknown): string {
  return normalizeSelector(rawSelector(target));
}

const PULSE_STATE_KEY = "egemed-pulse-6.0";
const PULSE_ACTORS = [null, "dev-admin-0001", "dev-student-0001"] as const;

interface PulseSeedOptions {
  readonly casesComplete?: boolean;
}

function pulseNamespaceOf(actorId: string | null): string {
  return actorId === null ? "egemed:anon:pulse:" : `egemed:u:${actorId}:pulse:`;
}

/**
 * T208 öğrenme kilidi: uygulama ve değerlendirme ekranları yalnız 23 paternin
 * tümü izlenmiş (değerlendirme ayrıca 10 vaka gönderilmiş) kayıtla açılır.
 */
/**
 * T210: runtime havuzu büyüdü (500 madde). A3.3'te uygulama/değerlendirme
 * maddeleri SUNUCU oturumundan gelir (seçenekler karıştırılır, cevap anahtarı
 * gitmez); doğru seçenek bankadan olgu+soru metniyle bulunur (`pulse-flows`).
 */
function seedSession(role: "case" | "quiz", submitted: boolean): Record<string, unknown> {
  return {
    // Oturum kimliği her koşuda benzersiz olmalı; sunucu aynı kimlikli denemeyi 409 ile reddeder.
    i: `egemed-seed-${role}-${Math.random().toString(36).slice(2, 10)}`,
    n: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    a: Array.from({ length: 10 }, () => (submitted ? 0 : -1)),
    s: submitted ? 1023 : 0,
    l: Array.from({ length: 10 }, () => [0, 0, 0]),
    x: Array.from({ length: 10 }, () => -1),
  };
}

function pulseSeedRecord(options: PulseSeedOptions = {}): Record<string, unknown> {
  return {
    version: 6,
    cv: curriculum.version,
    m: 0,
    t: 2,
    p: 1,
    f: 0,
    v: Array.from({ length: 23 }, () => 60_000),
    u: 4,
    c: seedSession("case", options.casesComplete === true),
    q: seedSession("quiz", false),
  };
}

async function seedPulseLearning(page: Page, options: PulseSeedOptions = {}): Promise<void> {
  const storageKeys = PULSE_ACTORS.map((actorId) => `${pulseNamespaceOf(actorId)}${PULSE_STATE_KEY}`);
  const record = pulseSeedRecord(options);
  await page.addInitScript((payload: { keys: string[]; value: Record<string, unknown> }) => {
    for (const key of payload.keys) localStorage.setItem(key, JSON.stringify(payload.value));
  }, { keys: storageKeys, value: record });
}

/** Kaynak runtime'ı emsal akışla açar: tohum → başlat → öğreticiyi atla. */
async function openPulse(page: Page, options: PulseSeedOptions = {}): Promise<Locator> {
  await seedPulseLearning(page, options);
  await page.goto("/#/sims/pulse");
  const root = page.locator(ROOT);
  // Birleşik barda kaynak açılış sayfası atlanır (T107); öğretici açıksa atlanır.
  await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
  if (await root.locator("#tutorialSkip").isVisible().catch(() => false)) await root.locator("#tutorialSkip").click();
  return root;
}

async function openMode(root: Locator, view: "sim" | "case" | "quiz"): Promise<void> {
  await root.locator(`#modeCards [data-view="${view}"]`).click();
}

/** 10 soruyu sunucu oturumunda doğru yanıtlayıp sonuç ekranını bekler (A3.3). */
async function completeQuiz(root: Locator): Promise<void> {
  // T208 kilidi: uygulama kartının açılması için 10 vaka gönderilmiş tohum gerekir.
  await openMode(root, "quiz");
  await completePulseQuiz(root);
}

const SCREENS: readonly PulseScreen[] = [
  {
    id: "sim",
    label: "Öğrenme",
    route: "#/sims/pulse/inceleme",
    async open(root) {
      await openMode(root, "sim");
      await expect(root.locator("#simView")).toBeVisible();
      await expect(root.locator('[data-pl="play"]')).toBeVisible();
      await expect(root.locator('[data-pl="msg"]')).toBeHidden({ timeout: 10_000 });
    },
  },
  {
    id: "case",
    label: "Vaka (bir soru cevaplanmış)",
    route: "#/sims/pulse/vaka",
    async open(root) {
      await openMode(root, "case");
      await expect(root.locator("#caseView")).toBeVisible({ timeout: 20_000 });
      await answerPulseCase(root);
      await expect(root.locator("#caseContinue")).toBeVisible();
    },
  },
  {
    id: "quiz",
    label: "Değerlendirme",
    route: "#/sims/pulse/sinav",
    seed: { casesComplete: true },
    async open(root) {
      await openMode(root, "quiz");
      await expect(root.locator("#quizView")).toBeVisible();
      await expect(root.locator("#quizSubmit")).toBeVisible();
    },
  },
  {
    id: "results",
    label: "Sonuç (10 soru bitince)",
    route: "#/sims/pulse/sonuc",
    seed: { casesComplete: true },
    async open(root) {
      await completeQuiz(root);
    },
  },
  {
    id: "gami",
    label: "İlerlemem diyaloğu",
    route: "#/sims/pulse/ilerlemem",
    async open(root) {
      await clickSimBarAction(root.page(), "İlerlemem");
      await expect(root.locator("#egemedGamiProgress")).toBeVisible();
      await expect(root.locator("#egemedGamiProgress").getByRole("tab", { name: "Başarılarım" })).toBeVisible();
    },
  },
];

/** Aktif ekranın kaydırma kabını bulur; modal açıkken yalnız diyaloğu kaydırır. */
async function scrollRuntime(page: Page, offset?: number): Promise<number> {
  return page.evaluate(
    ({ rootSelector, target }) => {
      const host = document.querySelector(rootSelector);
      const shadow = host?.shadowRoot ?? null;
      const dialog = shadow?.querySelector("dialog[open]") ?? null;
      const isScrollable = (node: Element): boolean => {
        const style = getComputedStyle(node);
        return /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
      };
      if (dialog !== null) {
        const max = dialog.scrollHeight - dialog.clientHeight;
        if (target !== null && isScrollable(dialog)) dialog.scrollTop = target;
        return Math.max(0, max);
      }
      let node: Element | null = shadow?.querySelector(".view:not([hidden])") ?? host;
      while (node !== null) {
        if (isScrollable(node)) {
          if (target !== null) node.scrollTop = target;
          return node.scrollHeight - node.clientHeight;
        }
        const parent = node.parentElement;
        if (parent !== null) {
          node = parent;
        } else {
          const root = node.getRootNode();
          node = root instanceof ShadowRoot ? root.host : null;
        }
      }
      const scroller = document.scrollingElement ?? document.documentElement;
      if (target !== null) scroller.scrollTop = target;
      return Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    },
    { rootSelector: ROOT, target: offset ?? null },
  );
}

/**
 * Renk karşıtlığı yalnız tamamen görünür öğeler için güvenilirdir; kırpılan
 * öğelerde axe arka planı yanlış örnekleyebildiği için ölçüm kararsızlaşır.
 */
async function fullyVisibleSelectors(page: Page, selectors: readonly string[]): Promise<Set<string>> {
  if (selectors.length === 0) return new Set();
  const visible = await page.evaluate(
    ({ rootSelector, candidates }) => {
      const shadow = document.querySelector(rootSelector)?.shadowRoot ?? null;
      return candidates.map((selector) => {
        try {
          const element = shadow?.querySelector(selector) ?? document.querySelector(selector);
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
    { rootSelector: ROOT, candidates: selectors },
  );
  return new Set(selectors.filter((_, index) => visible[index] === true));
}

/**
 * Ekran kaydırılırken axe tekrarlanır; görüntü alanı dışındaki öğeler axe'ta
 * "incomplete" döndüğü için tarama kaydırma boyunca birleştirilir.
 */
async function collectViolations(page: Page): Promise<Map<string, ObservedViolation>> {
  const observed = new Map<string, ObservedViolation>();
  const max = await scrollRuntime(page);
  const viewportHeight = page.viewportSize()?.height ?? 900;
  const step = Math.max(200, Math.round(viewportHeight * 0.6));
  for (let offset = 0; offset <= max + step; offset += step) {
    await scrollRuntime(page, Math.min(offset, max));
    await page.waitForTimeout(60);
    const results = await new AxeBuilder({ page })
      .include(ROOT)
      .withTags([...TAGS])
      .disableRules([...DISABLED_RULES])
      .analyze();
    const contrastSelectors = results.violations
      .filter((violation) => violation.id === "color-contrast")
      .flatMap((violation) => violation.nodes.map((node) => rawSelector(node.target)));
    const visibleContrast = await fullyVisibleSelectors(page, contrastSelectors);
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
  await scrollRuntime(page, 0);
  return observed;
}

/** Görünür button/input/select/a öğelerinden 44 px altında kalanları ölçer. */
async function collectSmallTargets(page: Page): Promise<Map<string, string>> {
  const measured = await page.evaluate(
    ({ rootSelector, min }) => {
      const host = document.querySelector(rootSelector);
      const shadow = host?.shadowRoot ?? null;
      if (shadow === null) return [] as { selector: string; size: string; area: number }[];
      const scope: ParentNode = shadow.querySelector("dialog[open]") ?? shadow;
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
    { rootSelector: ROOT, min: MIN_TARGET_PX },
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

test.describe("Pulse iç ekran erişilebilirliği (WCAG 2.2 AA + 44 px)", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const screen of SCREENS) {
    test(`${screen.label} (${screen.route})`, async ({ page }, testInfo: TestInfo) => {
      const errors = trackErrors(page);
      const root = await openPulse(page, screen.seed);
      await screen.open(root);

      const smallTargets = await collectSmallTargets(page);
      await captureRouteScreenshot(page, testInfo.project.name, screen.route);
      const violations = await collectViolations(page);

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
            !ALLOWLIST.violations.some(
              (entry) =>
                entry.screen === screen.id &&
                appliesToProject(entry, project) &&
                entry.rule === item.rule &&
                entry.target === item.target,
            ),
        )
        .map((item) => `${item.rule} | ${item.target}`);
      expect(unlistedViolations, `${screen.id}: izin listesinde olmayan axe ihlalleri`).toEqual([]);

      const fixedViolations = ALLOWLIST.violations
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
            !ALLOWLIST.smallTargets.some(
              (entry) =>
                entry.screen === screen.id && appliesToProject(entry, project) && entry.selector === selector,
            ),
        )
        .map(([selector, size]) => `${selector} | ${size}`);
      expect(unlistedSmallTargets, `${screen.id}: izin listesinde olmayan <${MIN_TARGET_PX}px hedefler`).toEqual([]);

      const fixedSmallTargets = ALLOWLIST.smallTargets
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
