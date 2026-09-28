import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureRouteScreenshot } from "./artifacts";
import { clickSimBarAction, trackErrors } from "./helpers";
import { answerPulseQuizItem, completePulseCases, completePulseQuiz } from "./pulse-flows";

/**
 * T220 (A3.4, ADR-009): İstemci müfredatı madde içeriği taşımaz; doğru seçenekler
 * yalnız bankadan (`e2e/pulse-flows.ts`) okunur. Runtime'dan gereken tek alan
 * içerik sürümüdür (`cv` tohumu).
 */
interface RuntimeCurriculum {
  readonly version: number;
}
function loadRuntimeCurriculum(): RuntimeCurriculum {
  const VENDOR = "packages/sim-pulse/src/runtime/vendor";
  const win: Record<string, unknown> = {};
  const load = (path: string): void => {
    const source = readFileSync(path, "utf8").replace("export default function run", "return function run");
    (new Function("module", source)(undefined) as (env: Record<string, unknown>) => void)({ window: win });
  };
  load(`${VENDOR}/model.js`);
  win["CardAIScorm"] = { previousStatus: "" };
  load(`${VENDOR}/curriculum.js`);
  return win["PulseCurriculum"] as RuntimeCurriculum;
}
const curriculum = loadRuntimeCurriculum();

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

/**
 * T208 öğrenme kilidi: uygulama ve değerlendirme, ALL_MODES'daki 23 paternin her
 * biri 16 sn izlenene kadar (değerlendirme ayrıca 10 vaka gönderilene kadar)
 * kapalıdır. Testler kayıt tohumuyla bu eşiği açar; `PULSE_STATE_KEY` biçimi
 * kaynak `scorm.js` ile aynıdır.
 */
interface PulseSeedOptions {
  readonly casesComplete?: boolean;
}

/**
 * Deterministik oturum tohumu: T210 ile runtime havuzu büyüdü (500 madde); spec,
 * doğru yanıt indekslerini TS veri aynasından (ilk 400 madde) okuduğu için
 * oturumlar C001–C010 / Q001–Q010 maddelerine sabitlenir.
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
    v: Array.from({ length: 23 }, () => 16_000),
    u: 4,
    c: seedSession("case", options.casesComplete === true),
    q: seedSession("quiz", false),
  };
}

/** Tüm paternler izlenmiş (isteğe bağlı: 10 vaka gönderilmiş) kayıtla başlatır. */
async function seedPulseLearning(
  page: Page,
  actorIds: readonly (string | null)[],
  options: PulseSeedOptions = {},
): Promise<void> {
  const storageKeys = actorIds.map((id) => `${namespaceOf(id)}${PULSE_STATE_KEY}`);
  const record = pulseSeedRecord(options);
  await page.addInitScript((payload: { keys: string[]; value: Record<string, unknown> }) => {
    for (const key of payload.keys) localStorage.setItem(key, JSON.stringify(payload.value));
  }, { keys: storageKeys, value: record });
}

/** Testlerin çoğu sim ekranından başlar; 23 patern izlenmiş sayılır. */
async function seedViewed(page: Page): Promise<void> {
  await seedPulseLearning(page, [null, ADMIN.actorId, STUDENT.actorId]);
}

async function openPulse(page: Page): Promise<Locator> {
  await page.goto("/#/sims/pulse");
  const root = page.locator(ROOT);
  // Birleşik barda kaynak açılış sayfası atlanır (UX kararı 25 Eylül 2026);
  // ilk kullanımda öğretici açılır, testler onu atlar.
  await expect(root.locator("#appRoot")).toBeVisible({ timeout: 20_000 });
  const skip = root.locator("#tutorialSkip");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  return root;
}

async function openMode(root: Locator, view: "sim" | "case" | "quiz"): Promise<void> {
  await root.locator(`#modeCards [data-view="${view}"]`).click();
}

test.describe("Pulse kaynak runtime", () => {
  test.beforeEach(async ({ page }) => {
    await suppressFullscreenPrompt(page, [null, ADMIN.actorId, STUDENT.actorId]);
  });

  test("gölge kökte açılır; tek h1, inceleme araçları ve EKG tam genişlikte", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await seedViewed(page);
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
    await seedViewed(page);
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

  test("10 vaka oturumu sunucu oturumundan çözülür ve tamamlanma raporuyla biter (PULSE-05, A3.3)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openMode(root, "case");
    // Maddeler sunucudan gelir: ekranda madde kimliği değil genel etiket ("Vaka 3") görünür
    // ve seçenekler opak jetonlarla karıştırılmıştır (cevap anahtarı istemcide yok).
    await expect(root.locator("#caseQuestionCard .eyebrow")).toHaveText(/EKG YORUMU · Vaka \d+$/, { timeout: 20_000 });
    await completePulseCases(root);
    await expect(root.getByText("Oturum tamamlandı")).toBeVisible();
    await expect(root.locator("#caseEnd")).toContainText("10/10 doğru");
    // Rapor başlıkları sunucu sonucundan gelir (madde kimliği bitişte açılır).
    await expect(root.locator("#caseEnd .dot").first()).toHaveAttribute("aria-label", /Sentetik vaka C\d{3}/);
    expect(errors).toEqual([]);
  });

  test("10 soru sunucu oturumundan gönderilir; sonuç ekranı puanı sunucudan gelir (PULSE-06, A3.3)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedPulseLearning(page, [null, ADMIN.actorId, STUDENT.actorId], { casesComplete: true });
    const root = await openPulse(page);
    await openMode(root, "quiz");
    await completePulseQuiz(root);
    await expect(root.getByRole("button", { name: /Tekrar dene/ })).toBeVisible();
    // KAYNAK-01: doğrudan sınava girip 100 alan öğrenci "Hedefin altında" görmez.
    await expect(root.locator("#resultsView")).toContainText("✓ Başarılı");
    await expect(root.locator("#resultsView")).not.toContainText("Hedefin altında");
    // Rapor sunucu geri bildirimiyle çizilir; doğru yanıt ve puan sunucudan gelir.
    await expect(root.locator("#resultsView .report-row-v2")).toHaveCount(10);
    await expect(root.locator("#resultsView .report-row-v2").first()).toContainText("10/10");

    // A3.3: sunucu oturumunda denemeyi sunucu yazar; istemci yerel skor kaydı YAPMAZ
    // (çift kayıt yok) ve sonuç ekranında yerel kazanım kartı çizilmez.
    const gami = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key) ?? "null") as { attempts: unknown[] } | null,
      `${namespaceOf(null)}egemed-pulse-gami-1.0`,
    );
    expect(gami?.attempts ?? [], "istemci yerel deneme kaydı yok").toEqual([]);
    await expect(root.locator("#egemedGamiGains")).toBeHidden();

    // "İlerlemem" İlerlemem sayfası yerel kayıt olmadan da açılır (demo verisi).
    await clickSimBarAction(page, "İlerlemem");
    const progress = root.locator("#egemedGamiProgress");
    await expect(progress).toBeVisible();
    await expect(progress.getByRole("tab", { name: "Başarılarım" })).toBeVisible();
    await expect(progress.getByRole("tab", { name: "Liderlik Tahtası" })).toBeVisible();
    await expect(progress).toContainText("Rozet koleksiyonu");
    await progress.getByRole("button", { name: /Simülatöre dön/ }).click();
    await expect(progress).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("kayıt kullanıcıya özeldir; başka hesap aynı oturumu görmez (PULSE-08)", async ({ page }) => {
    const asUser = async (session: typeof ADMIN | typeof STUDENT): Promise<void> => {
      await page.evaluate((value) => sessionStorage.setItem("egemed.devSession", JSON.stringify(value)), session);
    };
    await seedPulseLearning(page, [null, ADMIN.actorId, STUDENT.actorId], { casesComplete: true });
    await page.goto("/#/");
    await asUser(ADMIN);
    let root = await openPulse(page);
    await openMode(root, "quiz");
    await answerPulseQuizItem(root);
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
    // Sunucu oturumu kullanıcıya bağlıdır; öğrenci yeni bir oturum açar ve
    // maddeler hazır olduğunda hiçbir seçenek işaretli gelmez.
    expect(studentState === null || !studentState.includes(ADMIN.actorId), "öğrenci admin kaydını taşımaz").toBe(true);
    await openMode(root, "quiz");
    await expect(root.locator("#quizForm input:checked"), "öğrencide seçili yanıt yok").toHaveCount(0);
  });

  test("birleşik bar adımına tıklama mod seçimine döner; değerlendirmede kaynağın süre kaybı uyarısı çıkar (T181)", async ({ page }, testInfo) => {
    // Adım göstergesi birleşik barda ≥1024 px'te görünür (shell.css); dar ekranda adımlar çizilmez.
    test.skip((testInfo.project.use.viewport?.width ?? 0) < 1024, "adımlar yalnız ≥1024 px");
    const errors = trackErrors(page);
    await seedPulseLearning(page, [null, ADMIN.actorId, STUDENT.actorId], { casesComplete: true });
    const root = await openPulse(page);
    const stepButton = (label: string) => page.locator(".eg-shell-simbar__stepButton", { hasText: label });

    // Değerlendirme modu: kaynağın kendi süre kaybı uyarısı (quizExitDialog) devreye girer.
    // (A3.3: sunucu oturumunda uygulama kartına girmek YENİ bir uygulama oturumu
    // başlatır ve yerel "10 vaka gönderildi" ilerlemesini sıfırlar — bu yüzden sınav
    // denemesi uygulama turundan ÖNCE yapılır; T208 kapısı tohumla açıktır.)
    await openMode(root, "quiz");
    await expect(stepButton("Mod seçimi")).toBeVisible();
    await stepButton("Mod seçimi").click();
    const exitDialog = root.locator("#quizExitDialog");
    await expect(exitDialog).toBeVisible();
    // Vazgeç: değerlendirmede kalınır, mod ekranına geçilmez.
    await root.locator("#cancelQuizExit").click();
    await expect(exitDialog).toBeHidden();
    await expect(root.locator("#quizView")).toBeVisible();
    // Evet, çık: onay sonrası mod seçimine döner.
    await stepButton("Mod seçimi").click();
    await expect(exitDialog).toBeVisible();
    await root.locator("#confirmQuizExit").click();
    await expect(root.locator("#modeCards")).toBeVisible();

    // "Tamamla" adımından geri (index 1) desteklenmez; yalnız 0 (Mod seçimi) çalışır.
    await openMode(root, "quiz");
    await completePulseQuiz(root);
    // Tamamlanan her adım kabukta düğme olur, ama sim yalnız 0'ı (Mod seçimi)
    // destekler; "Çalışma" (1) tıklanınca sonuç ekranından ayrılmaz.
    const workStep = stepButton("Çalışma");
    await expect(workStep).toBeVisible();
    await workStep.click();
    await expect(root.locator("#resultsView")).toBeVisible();

    // Uygulama modu: yanıtlar otomatik kaydedildiğinden onay istenmeden döner.
    await stepButton("Mod seçimi").click();
    await expect(root.locator("#modeCards")).toBeVisible();
    await openMode(root, "case");
    await expect(root.locator("#caseView")).toBeVisible({ timeout: 20_000 });
    await expect(stepButton("Mod seçimi")).toBeVisible();
    await stepButton("Mod seçimi").click();
    await expect(root.locator("#modeCards")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("sim rotası doğrudan değiştirildiğinde her sim tek kökle açılır (PLATFORM-01)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
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

  test("öğrenme kilidi: paternler izlenmeden uygulama ve değerlendirme kapalıdır (T208)", async ({ page }) => {
    const errors = trackErrors(page);
    // Tohum yok: yeni kayıt; hiçbir patern izlenmemiş.
    const root = await openPulse(page);
    await expect(root.locator("#modeCards")).toBeVisible();
    const practice = root.locator("#modeCards .mode-card.practice");
    const assessment = root.locator("#modeCards .mode-card.assessment");
    await expect(practice.locator('button[data-view="case"]')).toBeDisabled();
    await expect(assessment.locator('button[data-view="quiz"]')).toBeDisabled();
    await expect(practice).toContainText("Önce öğrenme modunu tamamlayın: 0/23 patern izlendi.");
    await expect(assessment).toContainText("Önce öğrenme modunu tamamlayın: 0/23 patern izlendi.");
    // Kilitliyken tıklama görünüm değiştirmez (buton pasif).
    await practice.locator('button[data-view="case"]').click({ force: true });
    await expect(root.locator("#caseView")).toBeHidden();
    await expect(root.locator("#modesView")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Mobitz I sekmesi seçilip oynatılınca kalpte AV blok işareti belirir (T208)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openMode(root, "sim");
    await root.locator('.rhythm-tab[data-mode="mobitz1"]').click();
    await expect(root.locator(".rhythm-tab.selected")).toHaveAttribute("data-mode", "mobitz1");
    await expect(root.locator("#explanationTitle")).toContainText("Mobitz");
    await root.locator("#playBtn").click();
    // Mobitz I'de her 4. P iletilmez; blok işareti döngü boyunca görünür olur.
    await expect(root.locator("#heartSvg #avBlockMark")).toHaveCSS("opacity", "1", { timeout: 8_000 });
    // Klavye şerit sırasını izler: ] görünür sıradaki sonraki sekmeye geçer (T208).
    await page.keyboard.press("]");
    await expect(root.locator(".rhythm-tab.selected")).toHaveAttribute("data-mode", "mobitz2");
    expect(errors).toEqual([]);
  });

  test("ritim şeridi 390/768/1440 px'te yatay sayfa kaydırması yapmaz (T208)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openMode(root, "sim");
    await expect(root.locator(".rhythm-group")).toHaveCount(6);
    await expect(root.locator(".rhythm-tab[data-mode]")).toHaveCount(23);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(120);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `yatay sayfa taşması ${width}px`).toBeLessThanOrEqual(0);
      const strip = await root.locator(".rhythm-tabs").evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
      expect(strip.scrollWidth, `şerit kendi içinde kaydırılabilir ${width}px`).toBeGreaterThan(strip.clientWidth);
    }
    expect(errors).toEqual([]);
  });
});
