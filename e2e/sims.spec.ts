import { expect, test, type Page } from "@playwright/test";
import { openRoute, trackErrors } from "./helpers";

const NAV = "nav";

/** Simülatörler sayfasındaki kart bağlantısıyla paketin gerçek modül köküne geçer. */
async function openSimCard(page: Page, simId: "ausculta" | "pulse"): Promise<void> {
  await page.locator(`a[href="#/sims/${simId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/sims/${simId}$`));
  await expect(page.locator(`.eg-sim-${simId}`).first()).toBeVisible();
}

async function backToSimulators(page: Page): Promise<void> {
  await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
  await expect(page).toHaveURL(/#\/simulatorler$/);
  await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);
  await expect(page.locator(".eg-sim-pulse")).toHaveCount(0);
}

test.describe("sim rotaları yaşam döngüsü", () => {
  test("gerçek modüller arası geçişte tek kök kalır, ana sayfada sıfırdır", async ({ page }) => {
    await openRoute(page, "#/simulatorler");

    await openSimCard(page, "pulse");
    await expect(page.locator(".eg-sim-pulse")).toHaveCount(1);

    await backToSimulators(page);

    await openSimCard(page, "ausculta");
    // Paket kapsayıcısı ve `App` kökü aynı sınıfı paylaşır (iç içe); `app-shell`
    // yalnız modül köküne aittir, tek örnek olduğunu bu ölçer.
    await expect(page.locator(".eg-sim-ausculta.app-shell")).toHaveCount(1);
    await expect(page.locator(".eg-sim-pulse")).toHaveCount(0);

    await page.locator(`${NAV} a[href="#/"]`).click();
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);
  });

  test("geri tuşu önceki sim oturumunu tek kökle getirir", async ({ page }) => {
    await openRoute(page, "#/simulatorler");
    await openSimCard(page, "pulse");
    await backToSimulators(page);
    await openSimCard(page, "ausculta");

    await page.goBack();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);

    await page.goBack();
    await expect(page).toHaveURL(/#\/sims\/pulse$/);
    await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);
    await expect(page.locator(".eg-sim-pulse").first()).toBeVisible();
  });
});

/**
 * Opaca gerçek modüle bağlandı (T14c): kart artık yer tutucu değil, gerçek
 * @egemed/sim-opaca ağacını mount eder. Bu blok yer tutucu sözleşmesi yerine
 * gerçek modülün başlangıç ekranını, tek üst bar kuralını (embedded — kendi
 * marka üst barını çizmez) ve konsol/sayfa hatası olmadığını doğrular.
 */
test.describe("Opaca sim rotası (gerçek modül)", () => {
  test("başlangıç ekranı görünür, tek üst bar ve tek h1 kalır, konsol hatası yok", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/simulatorler");

    await page.locator('a[href="#/sims/opaca"]').click();
    await expect(page).toHaveURL(/#\/sims\/opaca$/);
    // Kaynak paket kapsayıcısı ve `App` kökü aynı "eg-sim-opaca" sınıfını
    // paylaşır (iç içe); `.first()` ilkini görünür bekler.
    await expect(page.locator(".eg-sim-opaca").first()).toBeVisible();

    // Gömülü modda tanıtım atlanır; mod seçimi ekranı açılır (S24).
    await expect(page.getByRole("heading", { name: "Çalışma modunu seçin" })).toBeVisible();
    await expect(page.locator(".mode-card.learn")).toBeVisible();
    await expect(page.locator(".mode-card.practice")).toBeVisible();
    await expect(page.locator(".mode-card.assessment")).toBeVisible();

    // Tek üst bar: Opaca embedded modda kendi marka üst barını (.eg-header) çizmez;
    // kabuğun kendi marka barı (.eg-shell-header) tek kalır, sayfada tek h1 vardır.
    await expect(page.locator("header.eg-header")).toHaveCount(0);
    await expect(page.locator("header.eg-shell-header")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    expect(errors, "konsol/sayfa hatası").toEqual([]);

    // Simülatörler'e dönünce Opaca kökü temiz biçimde kaldırılır.
    await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-opaca")).toHaveCount(0);

    expect(errors, "konsol/sayfa hatası (dispose sonrası)").toEqual([]);
  });
});

/**
 * Pulse gerçek modüle bağlandı (T14d): kart artık yer tutucu değil, gerçek
 * @egemed/sim-pulse ağacını mount eder. Pulse Opaca'dan farklı olarak
 * "embedded" React kökü değil, vanilla DOM kökü (`.eg-sim-pulse`) taşır ve
 * kendi bölüm gezinmesini (`.topbar`) her zaman çizer; bu bar kabuğun
 * `<main>`i içine gömülü olduğundan HTML "banner" rolü almaz (WHATWG header
 * kapsamı algoritması main'i sectioning kapsamına dahil eder) — sayfanın tek
 * "banner" üst barı kabuğun kendi `.eg-shell-header`ı olarak kalır. Bu blok
 * EKG kanvasının göründüğünü, tek üst bar/h1 kuralını, konsol hatası
 * olmadığını ve rota değişiminde dispose'un kanvası (RAF/timer'larıyla
 * birlikte) kaldırdığını doğrular.
 */
test.describe("Pulse sim rotası (gerçek modül)", () => {
  test("EKG kanvası görünür, tek üst bar ve tek h1 kalır, konsol hatası yok", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await openRoute(page, "#/simulatorler");

    await openSimCard(page, "pulse");

    // Gömülü modda tanıtım (landing) atlanır; mod seçimi ekranı açılır.
    await expect(page.getByRole("heading", { name: "Çalışma Modunu Seçin" })).toBeVisible();

    // Mod kartından ("İnceleme Modu") EKG inceleme ekranına geçilir.
    await page.locator(".mode-card.learn button").click();
    await expect(page.locator("[data-pulse-ecg]")).toBeVisible();

    // Tek üst bar: Pulse'un kendi bölüm çubuğu `<main>` içine gömülüdür,
    // "banner" rolü almaz; kabuğun kendi marka barı tek kalır. Sayfada tek
    // h1 vardır (kabuk çubuğu Pulse hazır olduğunda kendi h1'ini bırakır).
    await expect(page.locator("header.eg-shell-header")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    expect(errors, "konsol/sayfa hatası").toEqual([]);

    // Simülatörler'e dönünce Pulse kökü (kanvas dahil) temiz biçimde kaldırılır.
    await page.locator(`${NAV} a[href="#/simulatorler"]`).click();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-pulse")).toHaveCount(0);
    await expect(page.locator("[data-pulse-ecg]")).toHaveCount(0);

    // RAF/timer sızıntısı yok: dispose sonrası ek konsol/sayfa hatası oluşmaz.
    expect(errors, "konsol/sayfa hatası (dispose sonrası, RAF/timer sızıntısı yok)").toEqual([]);
  });
});

/** Ses bağlamı gözlemi: sayfa tarafında oluşturulan/kapanan bağlamlar. */
interface AudioProbeSnapshot {
  readonly created: number;
  readonly states: readonly string[];
}

/**
 * `AudioContext` yapıcısını sarar; T14e'de ses kayıtları git-dışı olduğundan
 * gerçek çalma denenemez, ama motorun bağlam yaşam döngüsü gözlenebilir:
 * `ensureContext` (kullanıcı hareketiyle) bağlamı açar, `engine.dispose`
 * rotadan çıkışta `close()` ile kapatır (audio/engine.ts). Sayfa yüklenmeden
 * önce kurulmalıdır (`addInitScript`).
 *
 * `setPointerCapture` da nötrlenir: sözde `pointerdown` olayına eşlik eden
 * etkin bir işaretçi yoktur ve gerçek fare ile steteskopa ulaşılamaz
 * (mobilde sahne kutusu sıfır yüksekliğe iner, üstteki katmanlar işaretçiyi
 * yakalar); yakalama çağrısı `armDrag`tan önce atılırsa bağlam açılmaz.
 */
async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const capture = Element.prototype as unknown as { setPointerCapture?: () => void };
    if (typeof capture.setPointerCapture === "function") {
      capture.setPointerCapture = () => undefined;
    }
    const scope = window as unknown as {
      AudioContext?: new (...args: never[]) => unknown;
      webkitAudioContext?: new (...args: never[]) => unknown;
      __egemedAudioProbe?: { created: number; contexts: unknown[] };
    };
    const state = { created: 0, contexts: [] as unknown[] };
    scope.__egemedAudioProbe = state;
    const Original = scope.AudioContext ?? scope.webkitAudioContext;
    if (typeof Original !== "function") return;
    scope.AudioContext = new Proxy(Original, {
      construct(target, args) {
        const context = Reflect.construct(target, args);
        state.created += 1;
        state.contexts.push(context);
        return context;
      },
    });
  });
}

async function readAudioProbe(page: Page): Promise<AudioProbeSnapshot> {
  return page.evaluate((): AudioProbeSnapshot => {
    const scope = window as unknown as {
      __egemedAudioProbe?: { created: number; contexts: { state?: string }[] };
    };
    const probe = scope.__egemedAudioProbe;
    return {
      created: probe?.created ?? 0,
      states: (probe?.contexts ?? []).map((context) => context.state ?? "unknown"),
    };
  });
}

/**
 * Ausculta gerçek modüle bağlandı (T14e): kart yer tutucu yerine
 * @egemed/sim-ausculta ağacını mount eder. Bu blok gömülü modun mod seçimi
 * ekranını, tek üst bar/tek h1 kuralını, kök-göreli gövde görselinin
 * yüklendiğini (vite kök köprüsü, `assets/body/**`) ve rotadan çıkışta
 * dispose'un kökü kaldırıp motorun açtığı ses bağlamını kapattığını doğrular.
 */
test.describe("Ausculta sim rotası (gerçek modül)", () => {
  test("mod seçimi görünür, tek üst bar ve tek h1 kalır, ses bağlamı çıkışta kapanır", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await installAudioProbe(page);
    await openRoute(page, "#/simulatorler");

    await openSimCard(page, "ausculta");

    // Gömülü modda tanıtım atlanır; mod seçimi ekranı açılır (h2; kabuk h1'i korur).
    await expect(page.getByRole("heading", { name: "Çalışma Modunu Seçin" })).toBeVisible();
    await expect(page.locator(".mode-card.learn h3")).toHaveText("İnceleme Modu");
    await expect(page.locator(".mode-card.practice")).toBeVisible();
    await expect(page.locator(".mode-card.assessment")).toBeVisible();

    // Tek üst bar: Ausculta gömülü modda kendi `<header>`ını çizmez;
    // kabuğun marka barı tek kalır, sayfada tek h1 vardır.
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("header.eg-shell-header")).toHaveCount(1);
    await expect(page.locator("h1")).toHaveCount(1);

    // İnceleme Modu: gömülü modda öğretici atlanır, doğrudan öğrenme ekranı
    // açılır; hasta gövdesi kök-göreli `assets/body/front.jpg` yolundan gelir
    // (vite kök köprüsü). Görselin görünürlüğü yerine yüklendiği ölçülür:
    // 360 px'te sahne kutusu sıfır yüksekliğe inse de istek yapılır.
    await page.locator(".mode-card.learn button").click();
    const steth = page.locator(".steth").first();
    await expect(steth).toBeVisible();
    const bodyImage = page.locator(".body-img").first();
    await expect
      .poll(async () =>
        bodyImage.evaluate((image: { complete: boolean; naturalWidth: number }) => ({
          complete: image.complete,
          naturalWidth: image.naturalWidth,
        })),
      )
      .toEqual({ complete: true, naturalWidth: 1000 });

    // Steteskop üzerinde pointer down → `armDrag` → `ensureContext`: ses
    // bağlamı açılır. Olay sözde gönderilir (yukarıdaki gerekçe) ve
    // bırakılmaz; bırakma dwell ile kayıt ister, kayıtlar git-dışıdır.
    await steth.dispatchEvent("pointerdown", {
      button: 0,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });
    await expect.poll(async () => (await readAudioProbe(page)).created).toBeGreaterThan(0);
    const opened = (await readAudioProbe(page)).states;
    expect(opened.length).toBeGreaterThan(0);
    expect(opened.every((state) => state === "closed")).toBe(false);

    expect(errors, "konsol/sayfa hatası").toEqual([]);

    // Rotadan çıkış (hash geçmişi): modül dispose edilir; kök kalkar ve motor
    // açtığı her ses bağlamını `close()` ile kapatır.
    await page.goBack();
    await expect(page).toHaveURL(/#\/simulatorler$/);
    await expect(page.locator(".eg-sim-ausculta")).toHaveCount(0);
    await expect
      .poll(async () => (await readAudioProbe(page)).states.every((state) => state === "closed"))
      .toBe(true);

    expect(errors, "konsol/sayfa hatası (dispose sonrası)").toEqual([]);
  });
});
