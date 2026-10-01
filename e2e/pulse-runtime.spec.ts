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

/** T298: öğrenme alanı gerçek kaydı yükleyene dek bekler. */
async function openLearn(root: Locator): Promise<void> {
  await openMode(root, "sim");
  await expect(root.locator('[data-pl="canvas"]')).toBeVisible();
  await expect(root.locator('[data-pl="msg"]')).toBeHidden({ timeout: 10_000 });
}

async function openMode(root: Locator, view: "sim" | "case" | "quiz"): Promise<void> {
  await root.locator(`#modeCards [data-view="${view}"]`).click();
}

test.describe("Pulse kaynak runtime", () => {
  test.beforeEach(async ({ page }) => {
    await suppressFullscreenPrompt(page, [null, ADMIN.actorId, STUDENT.actorId]);
  });

  test("gölge kökte açılır; tek h1, kalp kesiti ve 12 derivasyon EKG tam genişlikte (T298)", async ({ page }, testInfo) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openLearn(root);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("header.eg-shell-header")).toHaveCount(1);
    for (const selector of ['[data-pl="play"]', '[data-pl="canvas"]', ".pl-heart-svg", '[data-pl="cal"]']) await expect(root.locator(selector)).toBeVisible();
    // 29 patern; kaydı olmayan (posterior MI) seçilemez
    await expect(root.locator(".pl-pt")).toHaveCount(29);
    await expect(root.locator(".pl-pt[disabled]")).toHaveCount(1);
    await expect(root.locator(".pl-rec")).toHaveCount(3);
    await expect(root.getByText("Öğretim Üyesinin Seçtiği Kayıtlar")).toBeVisible();
    // "Bu patern hakkında" açılır pencere değil, EKG'nin altında sabit
    await expect(root.locator(".pl-about [data-pl='crit']")).toContainText("PR 120–200 ms");
    const ecgWidth = await root.locator('[data-pl="canvas"]').evaluate((c) => (c as HTMLCanvasElement).getBoundingClientRect().width);
    expect(ecgWidth, "EKG kâğıdı çerçeveyi doldurur").toBeGreaterThan((page.viewportSize()?.width ?? 0) * 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await captureRouteScreenshot(page, testInfo.project.name, "#/sims/pulse (inceleme)");
    expect(errors).toEqual([]);
  });

  test("kalp kesiti oynatılırken kaydın R tepelerine kilitli değişir (PULSE-03, T298)", async ({ page }) => {
    await seedViewed(page);
    const root = await openPulse(page);
    await openLearn(root);
    await root.locator('[data-pl="play"]').click();
    const shapes = new Set<string>();
    const labels = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      shapes.add(await root.locator('.pl-heart-svg [data-h="LV"]').getAttribute("d") ?? "");
      labels.add(await root.locator('[data-pl="hstate"]').innerText());
      await page.waitForTimeout(140);
    }
    expect(shapes.size, "farklı sol ventrikül biçimi").toBeGreaterThan(1);
    expect(labels.size, "farklı kalp evresi").toBeGreaterThan(1);
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
    await expect(practice).toContainText("Önce öğrenme modunu tamamlayın: 0/23 EKG sonucu incelendi.");
    await expect(assessment).toContainText("Önce öğrenme modunu tamamlayın: 0/23 EKG sonucu incelendi.");
    // Kilitliyken tıklama görünüm değiştirmez (buton pasif).
    await practice.locator('button[data-view="case"]').click({ force: true });
    await expect(root.locator("#caseView")).toBeHidden();
    await expect(root.locator("#modesView")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Mobitz I seçilip oynatılınca kalpte iletilmeyen P belirir (T298)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openLearn(root);
    await root.locator('.pl-pt[data-key="mobitz1"]').click();
    await expect(root.locator('.pl-pt[aria-current="true"]')).toHaveAttribute("data-key", "mobitz1");
    await expect(root.locator('[data-pl="name"]')).toContainText("Mobitz I");
    await expect(root.locator('[data-pl="crit"]')).toContainText("Wenckebach");
    await expect(root.locator('[data-pl="msg"]')).toBeHidden({ timeout: 10_000 });
    await root.locator('[data-pl="play"]').click();
    // Uzun RR içinde iletilmeyen P (~0,3 s): atriyum kasılır, uyarı AV düğümde
    // durur. Pencere kısa olduğu için evre etiketi tarayıcıda 50 ms'de bir örneklenir.
    const labels = await root.locator('[data-pl="hstate"]').evaluate(async (node) => {
      const seen = new Set<string>();
      for (let i = 0; i < 240; i += 1) {
        seen.add(node.textContent ?? "");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return [...seen];
    });
    expect(labels).toContain("P iletilmedi · AV blok");
    expect(errors).toEqual([]);
  });

  test("öğrenme alanı 390/768/1440 px'te yatay sayfa kaydırması yapmaz; dar ekranda patern rayı kendi içinde kayar (T298)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openLearn(root);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `yatay sayfa taşması ${width}px`).toBeLessThanOrEqual(0);
      if (width < 1100) {
        const rail = await root.locator(".pl-rail").evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
        expect(rail.scrollWidth, `ray kendi içinde kaydırılabilir ${width}px`).toBeGreaterThan(rail.clientWidth);
      }
    }
    await root.locator('.pl-pt[data-key="vt"]').click();
    await expect(root.locator('[data-pl="name"]')).toContainText("Ventriküler taşikardi");
    expect(errors).toEqual([]);
  });

  test("masaüstünde öğrenme alanı başlıkla alt bilgi arasına oturur; sayfa kaymaz, sütunların altına ulaşılır (T299)", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop-1440", "sütun içi kaydırma masaüstü düzenidir");
    await page.setViewportSize({ width: 1440, height: 760 });
    await seedViewed(page);
    const root = await openPulse(page);
    await openLearn(root);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), "sayfa kayması").toBeLessThanOrEqual(0);
    await expect(page.locator(".eg-shell-footer").first()).toBeInViewport();
    for (const column of [".pl-left", ".pl-right"]) {
      // Sütun sonuna kaydırılınca son öğesi sütunun görünür alanında kalır (kesilmez).
      const fits = await root.locator(column).evaluate((node) => {
        node.scrollTop = node.scrollHeight;
        const box = node.getBoundingClientRect();
        const last = node.lastElementChild?.getBoundingClientRect();
        return last !== undefined && last.bottom <= box.bottom + 1;
      });
      expect(fits, `${column} sonu görünür`).toBe(true);
    }
  });

  test("Orijinal Görüntü ham kaydı gösterir; oynatma, kaliper ve kalp animasyonu bu sırada kapalıdır (T299)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openLearn(root);
    const pl = (name: string): Locator => root.locator(`[data-pl="${name}"]`);
    await pl("play").click();
    await pl("origBtn").click();
    await expect(pl("origBtn")).toHaveAttribute("aria-pressed", "true");
    await expect(pl("orig")).toBeVisible();
    await expect(pl("orig")).toHaveAttribute("src", /assets\/ecg-orig\/JS00277\.png$/);
    expect(await pl("orig").evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(pl("canvas")).toBeHidden();
    await expect(pl("cal")).toBeHidden();
    for (const name of ["play", "calBtn"]) await expect(pl(name)).toBeDisabled();
    await expect(pl("playRate").locator("button").first()).toBeDisabled();
    await expect(pl("play")).toHaveText("▶ Oynat");
    await expect(pl("hstate")).toHaveText("Orijinal görüntü · animasyon kapalı");
    const frozen = await root.locator('.pl-heart-svg [data-h="LV"]').getAttribute("d");
    await page.waitForTimeout(400);
    expect(await root.locator('.pl-heart-svg [data-h="LV"]').getAttribute("d"), "kalp duruyor").toBe(frozen);
    // Kayıt değişince orijinal görüntü de değişir
    await root.locator(".pl-rec").nth(1).click();
    await expect(pl("orig")).toHaveAttribute("src", /JS00401\.png$/);
    await pl("origBtn").click();
    await expect(pl("canvas")).toBeVisible();
    await expect(pl("play")).toBeEnabled();
    expect(errors).toEqual([]);
  });

  test("oynatma hızı (0,5× / 1× / 2×) yalnız zamanı değiştirir; EKG kâğıdı 25 mm/s · 10 mm/mV sabit kalır (T300)", async ({ page }) => {
    const errors = trackErrors(page);
    await seedViewed(page);
    const root = await openPulse(page);
    await openLearn(root);
    const rates = root.locator('[data-pl="playRate"] button');
    await expect(rates).toHaveText(["0,5×", "1×", "2×"]);
    await expect(root.locator(".pl-tools")).not.toContainText("mm/s");
    await expect(root.locator(".pl-tools")).not.toContainText("mm/mV");
    const paper = async (): Promise<string> => root.locator('[data-pl="canvas"]').evaluate((c) => (c as HTMLCanvasElement).toDataURL());
    const before = await paper();
    for (const label of ["2×", "0,5×"]) {
      await rates.filter({ hasText: label }).click();
      await expect(rates.filter({ hasText: label })).toHaveAttribute("aria-pressed", "true");
      expect(await paper(), `${label} kâğıdı değiştirmez`).toBe(before);
    }
    expect(errors).toEqual([]);
  });

  test("inceleme süresi kaynağın öğrenme sayacına yazılır (T298)", async ({ page }) => {
    const errors = trackErrors(page);
    const root = await openPulse(page);
    await openLearn(root);
    await expect(root.locator('[data-pl="done"]')).toHaveText("0");
    await expect(root.locator('[data-pl="total"]')).toHaveText("23");
    await expect.poll(async () => root.locator('[data-pl="studyText"]').innerText(), { timeout: 8_000 }).toMatch(/İnceleme [2-9]\/16 s/);
    expect(errors).toEqual([]);
  });
});
