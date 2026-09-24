import { expect, test, type Locator, type Page } from "@playwright/test";
import { curriculum } from "../packages/sim-pulse/src/data/curriculum";
import { captureRouteScreenshot } from "./artifacts";
import { trackErrors } from "./helpers";

/**
 * Pulse kaynak runtime'ı (EGEMED_PULSE/cardai) platform içinde (PULSE-00).
 * Kabul: Astra denetimi 2026-09-24 — kaynakla aynı senaryolar (10 vaka / 10
 * soru, inceleme araçları, kalp animasyonu), kullanıcı×sim kayıt izolasyonu
 * (PULSE-08) ve doğrudan sim değişimi (PLATFORM-01).
 */
const ROOT = ".egemed-pulse-runtime";
const PULSE_STATE_KEY = "egemed-pulse-6.0";
const ADMIN = { actorId: "dev-admin-0001", role: "admin" } as const;
const STUDENT = { actorId: "dev-student-0001", role: "student" } as const;

function namespaceOf(actorId: string | null): string {
  return actorId === null ? "egemed:anon:pulse:" : `egemed:u:${actorId}:pulse:`;
}

/** Tam ekran önerisi kaynakta ilk girişte açılır; testlerde kapalı başlatılır. */
async function suppressFullscreenPrompt(page: Page, actorIds: readonly (string | null)[]): Promise<void> {
  const keys = actorIds.map((id) => `${namespaceOf(id)}pulse.fsPromptDone`);
  await page.addInitScript((list: string[]) => {
    for (const key of list) localStorage.setItem(key, "1");
  }, keys);
}

async function openPulse(page: Page): Promise<Locator> {
  await page.goto("/#/sims/pulse");
  const root = page.locator(ROOT);
  await root.locator("#startSimulator").click();
  if (await root.locator("#tutorialSkip").isVisible()) await root.locator("#tutorialSkip").click();
  return root;
}

async function openMode(root: Locator, view: "sim" | "case" | "quiz"): Promise<void> {
  await root.locator(`#modeCards [data-view="${view}"]`).click();
}

function correctOf(id: string): number {
  const item = curriculum.byId[id];
  if (item === undefined) throw new Error(`Bilinmeyen madde: ${id}`);
  return item.correct;
}

test.describe("Pulse kaynak runtime", () => {
  test.beforeEach(async ({ page }) => {
    await suppressFullscreenPrompt(page, [null, ADMIN.actorId, STUDENT.actorId]);
  });

  test("gölge kökte açılır; tek h1, inceleme araçları ve EKG tam genişlikte", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    const root = await openPulse(page);
    await openMode(root, "sim");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("header.eg-shell-header")).toHaveCount(1);
    for (const id of ["#playBtn", "#ecgCanvas", "#heartSvg"]) await expect(root.locator(id)).toBeVisible();
    const controls = await root.locator("button, input, select, canvas").evaluateAll(
      (nodes) => nodes.filter((node) => (node as HTMLElement).getClientRects().length > 0).length,
    );
    expect(controls, "kaynak kontrol envanteri (kaynak: ~50)").toBeGreaterThanOrEqual(45);
    const ecgWidth = await root.locator("#ecgCanvas").evaluate((c) => (c as HTMLCanvasElement).width);
    expect(ecgWidth, "EKG canvas varsayılan 300px değil").toBeGreaterThan(300 * 0.9);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/pulse (inceleme)");
    expect(errors).toEqual([]);
  });

  test("kalp SVG'si oynatılırken motorla birlikte değişir (PULSE-03)", async ({ page }) => {
    const root = await openPulse(page);
    await openMode(root, "sim");
    await root.locator("#playBtn").click();
    const states = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      states.add(
        await root.locator("#heartSvg").evaluate((svg) => svg.outerHTML),
      );
      await page.waitForTimeout(180);
    }
    expect(states.size, "farklı kalp durumu sayısı").toBeGreaterThan(1);
  });

  test("10 vaka oturumu tamamlanma raporuyla biter (PULSE-05)", async ({ page }) => {
    const errors = trackErrors(page);
    const root = await openPulse(page);
    await openMode(root, "case");
    for (let i = 0; i < 10; i += 1) {
      const eyebrow = await root.locator("#caseQuestionCard .eyebrow").innerText();
      const id = /C\d{3}/.exec(eyebrow)?.[0];
      expect(id, `vaka ${i + 1} kimliği`).toBeDefined();
      await root.locator(`input[name="activeCase"][value="${correctOf(id ?? "")}"]`).check();
      await root.locator("#caseCheck").click();
      await root.locator("#caseContinue").click();
    }
    await expect(root.getByText("Oturum tamamlandı")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("10 soru gönderilince sonuç ekranı ve 'Tekrar dene' gelir (PULSE-06)", async ({ page }) => {
    const errors = trackErrors(page);
    const root = await openPulse(page);
    await openMode(root, "quiz");
    for (let i = 0; i < 10; i += 1) {
      const id = /Q\d{3}/.exec(await root.locator("#quizForm").innerText())?.[0];
      expect(id, `soru ${i + 1} kimliği`).toBeDefined();
      await root.locator(`#quizForm input[value="${correctOf(id ?? "")}"]`).check();
      await root.locator("#quizSubmit").click();
      if (i < 9) await root.locator("#quizItemNext").click();
    }
    await expect(root.locator("#resultsView")).toBeVisible();
    await expect(root.getByRole("button", { name: /Tekrar dene/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("kayıt kullanıcıya özeldir; başka hesap aynı oturumu görmez (PULSE-08)", async ({ page }) => {
    const asUser = async (session: typeof ADMIN | typeof STUDENT): Promise<void> => {
      await page.evaluate((value) => sessionStorage.setItem("egemed.devSession", JSON.stringify(value)), session);
    };
    await page.goto("/#/");
    await asUser(ADMIN);
    let root = await openPulse(page);
    await openMode(root, "quiz");
    const id = /Q\d{3}/.exec(await root.locator("#quizForm").innerText())?.[0] ?? "";
    await root.locator(`#quizForm input[value="${correctOf(id)}"]`).check();
    await root.locator("#quizSubmit").click();
    await page.goto("/#/simulatorler");
    const adminState = await page.evaluate(
      (key) => localStorage.getItem(key),
      `${namespaceOf(ADMIN.actorId)}${PULSE_STATE_KEY}`,
    );
    expect(adminState, "admin kaydı kendi ad alanında").not.toBeNull();
    expect(await page.evaluate((key) => localStorage.getItem(key), PULSE_STATE_KEY), "paylaşılan anahtar yok").toBeNull();

    await asUser(STUDENT);
    root = await openPulse(page);
    const studentState = await page.evaluate(
      (key) => localStorage.getItem(key),
      `${namespaceOf(STUDENT.actorId)}${PULSE_STATE_KEY}`,
    );
    expect(studentState === null || !studentState.includes(id), "öğrenci admin oturumunu yüklemez").toBe(true);
    await openMode(root, "quiz");
    await expect(root.locator("#quizForm input:checked"), "öğrencide seçili yanıt yok").toHaveCount(0);
  });

  test("sim rotası doğrudan değiştirildiğinde her sim tek kökle açılır (PLATFORM-01)", async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto("/#/sims/pulse");
    await expect(page.locator(ROOT)).toHaveCount(1);
    for (const [hash, selector] of [
      ["#/sims/opaca", ".eg-sim-opaca"],
      ["#/sims/ausculta", ".eg-sim-ausculta.app-shell"],
      ["#/sims/pulse", ROOT],
      ["#/sims/opaca", ".eg-sim-opaca"],
    ] as const) {
      await page.evaluate((next) => {
        window.location.hash = next;
      }, hash);
      await expect(page.locator(".eg-shell-sim-page")).toHaveAttribute("aria-busy", "false");
      await expect(page.locator(selector).first()).toBeVisible();
      await expect(page.locator(".eg-shell-sim-page__host > *")).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });
});
