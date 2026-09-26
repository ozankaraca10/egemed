import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { captureRouteScreenshot, writeAxeArtifact } from "./artifacts";
import { clickAdminFilterButton, fillAdminFilter, selectAdminFilterOption, trackErrors } from "./helpers";

/**
 * T75 — Kabuk admin ekranlarının uçtan uca akışları (E3 §e.1-§e.7).
 *
 * Sentetik kaynaklar (`apps/shell/src/admin/*DataSource.ts`) sayfa başına
 * yeniden üretilir; bu yüzden mutasyon sonrası ayrı bir rotaya geçildiğinde
 * veri başlangıç tohumuna döner ve doğrulamalar akışın kendi ekranında yapılır.
 * Tüm veriler deterministik tohumludur (seed 69/91), bu yüzden sayılar sabittir.
 */

const ADMIN_ENTRY = "/#/giris/admin";
const USERS = "#/admin/kullanicilar";
const USER_CREATE = "#/admin/kullanicilar/yeni";
const IMPORT = "#/admin/ice-aktar";
const ROLES = "#/admin/roller";
const AUDIT = "#/admin/denetim";
const userDetail = (id: string): string => `#/admin/kullanicilar/${id}`;

/** Öğrenci oturumunun reddedilmesi gereken tüm korumalı rotalar (routes.ts). */
const ADMIN_ROUTES = [
  "#/admin",
  USERS,
  USER_CREATE,
  userDetail("user-001"),
  IMPORT,
  ROLES,
  AUDIT,
] as const;

/** Doğrulama adımında 1 geçerli + 3 hatalı satır üreten sabit CSV (E3 §f). */
const IMPORT_CSV = [
  "kullanici_adi;eposta;ad_soyad;rol;birim_kodu;sim_erisimi;giris_tipi",
  "yeni.ogrenci.001;;Örnek Öğrenci Yeni;;3-sinif;pulse;",
  ";;A;;;xyz;",
  "yeni.ogrenci.002;gecersiz-eposta;Örnek Öğrenci İki;;5-sinif;;",
  "yeni.ogrenci.001;;Örnek Öğrenci Yeni;;3-sinif;pulse;",
].join("\n");

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] as const;

async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto(ADMIN_ENTRY);
  await page.fill("#entry-username", "admin");
  await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/#\/admin$/);
}

async function signInAsStudent(page: Page): Promise<void> {
  await page.goto("/#/giris/test-ogrenci");
  await page.fill("#entry-username", "ogrenci");
  await page.fill("#entry-password", "egemed");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(/#\/$/);
}

async function openAdmin(page: Page, hash: string): Promise<void> {
  // networkidle yerine deterministik bekleme: dev sunucusunun HMR soketi
  // yeniden bağlanırken ağ hiç "idle" olmayabiliyor; her çağrı kendi
  // ekranına özgü bir doğrulama beklediği için yükleme koşulu aranmaz.
  const target = `/${hash}`;
  if (page.url().endsWith(target)) {
    // Aynı hash'e goto tarayıcıda yeniden yükleme yapmaz; walk testi gibi
    // ekran durumlarını sırayla kuran akışlarda temiz başlangıç için reload.
    await page.reload({ waitUntil: "domcontentloaded" });
  } else {
    await page.goto(target, { waitUntil: "domcontentloaded" });
  }
  await expect(page.locator("main#icerik")).toBeVisible();
}

/** Aynı kaydın tablo/kart kopyalarından yalnız görünür olanı seçer (360↔768 kırılımı). */
function visible(locator: Locator): Locator {
  return locator.filter({ visible: true });
}

/** Liste kayıtları: `@egemed/ui` `DataTable` gövdesindeki satırlar (T156, 360↔768'te aynı DOM, CSS ile yığılır). */
function listRows(page: Page): Locator {
  return page.locator(".eg-dtable tbody tr");
}

function currentStep(page: Page): Locator {
  return page.locator('.eg-shell-import__step[aria-current="step"]');
}

/** Adım göstergesi numarayı `aria-hidden` taşır; bu yüzden metin parçası aranır ("1Şablon"). */
async function expectStep(page: Page, label: string): Promise<void> {
  await expect(currentStep(page)).toContainText(label);
}

/** Ekle formunu geçerli değerlerle doldurur (rol alanı kilitli `kullanici` kalır). */
async function fillCreateUserForm(dialog: Locator, username: string): Promise<void> {
  const textInputs = dialog.locator('input[type="text"]');
  await textInputs.nth(0).fill(username);
  await textInputs.nth(1).fill("Örnek Kullanıcı T75");
  await dialog.getByLabel("Birim").selectOption("unit-3");
  await dialog.getByLabel("Pulse").check();
}

/** Şablon → yükle → eşle → doğrula adımlarını geçip doğrulama özetini bekler. */
async function importToValidate(page: Page): Promise<void> {
  await openAdmin(page, IMPORT);
  await page.getByRole("button", { name: "İleri" }).click();
  await page.getByLabel("CSV içeriği").fill(IMPORT_CSV);
  await page.getByRole("button", { name: "Yükle" }).click();
  await expect(page.getByText("4 satır algılandı")).toBeVisible();
  await page.getByRole("button", { name: "İleri" }).click();
  await page.getByRole("button", { name: "İleri" }).click();
  await expectStep(page, "Doğrula");
  await expect(page.getByText("1 geçerli · 3 hatalı")).toBeVisible();
}

/** Doğrulamadan önizleme ve uygulama onayına ilerler. */
async function importToApplyConfirm(page: Page): Promise<void> {
  await importToValidate(page);
  await page.getByRole("button", { name: "İleri" }).click();
  await expectStep(page, "Önizle");
  await page.getByRole("button", { name: "İleri" }).click();
  await expectStep(page, "Uygula");
  await page.getByRole("button", { name: "Uygula" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "İçe aktarmayı uygula" })).toBeVisible();
}

test.describe("admin kullanıcı listesi (E3 §e.1)", () => {
  test("arama, filtre ve sayfalama sonuçları", async ({ page }) => {
    await signInAsAdmin(page);
    await openAdmin(page, USERS);
    await expect(page.getByRole("heading", { name: "Kullanıcılar" })).toBeVisible();
    await expect(page.getByText("1–20 / 240 kayıt")).toBeVisible();
    await expect(visible(page.getByRole("button", { name: "Önceki" }))).toBeDisabled();

    await fillAdminFilter(page, "Ara", "ornek.kullanici.137");
    await expect(page.getByText("1–1 / 1 kayıt")).toBeVisible();
    await expect(visible(page.getByRole("link", { name: "Örnek Kullanıcı 137" }))).toBeVisible();

    await fillAdminFilter(page, "Ara", "t75-eslesmeyen-arama");
    await expect(page.getByText("Bu filtrelerle sonuç bulunamadı.")).toBeVisible();
    await clickAdminFilterButton(page, "Filtreleri temizle");
    await expect(page.getByText("1–20 / 240 kayıt")).toBeVisible();

    await selectAdminFilterOption(page, "Rol", "Yönetici");
    await expect(page.getByText("1–6 / 6 kayıt")).toBeVisible();
    await expect(visible(page.getByRole("link", { name: "Örnek Kullanıcı 036" }))).toBeVisible();
    await expect(page.getByText("Örnek Kullanıcı 002")).toHaveCount(0);
    await selectAdminFilterOption(page, "Durum", "Davetli");
    await expect(page.getByText("1–2 / 2 kayıt")).toBeVisible();
    await expect(visible(page.getByRole("link", { name: "Örnek Kullanıcı 217" }))).toBeVisible();
    await clickAdminFilterButton(page, "Filtreleri temizle");
    await expect(page.getByText("1–20 / 240 kayıt")).toBeVisible();

    await selectAdminFilterOption(page, "Sıralama", "Ada göre (Z-A)");
    await expect(visible(page.getByRole("link", { name: "Örnek Kullanıcı 240" }))).toBeVisible();
    await visible(page.getByRole("button", { name: "Sonraki" })).click();
    await expect(page.getByText("21–40 / 240 kayıt")).toBeVisible();
    await visible(page.getByRole("button", { name: "Önceki" })).click();
  });

  test("çoklu seçim aria-live duyurusu, Escape temizliği ve rol kaldırma koruması", async ({ page }) => {
    await signInAsAdmin(page);
    await openAdmin(page, USERS);
    await expect(page.getByText("1–20 / 240 kayıt")).toBeVisible();

    // E3 §e.1: seçim sayısı aria-live ile duyurulur; Escape seçimi temizler.
    const live = page.locator('p[aria-live="polite"]');
    await expect(live).toHaveText("");
    const boxes = visible(page.getByRole("checkbox"));
    await expect(boxes).toHaveCount(20);
    await boxes.nth(0).check();
    await expect(live).toHaveText("1 kullanıcı seçildi");
    await boxes.nth(1).check();
    await expect(live).toHaveText("2 kullanıcı seçildi");
    await expect(visible(page.getByRole("button", { name: "Toplu işlem" }))).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(live).toHaveText("");
    await expect(visible(page.getByRole("button", { name: "Toplu işlem" }))).toHaveCount(0);

    // Toplu rol kaldırma: admin rolü sunulmaz; tüm rolleri boşaltan satırlar atlanır.
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await visible(page.getByRole("button", { name: "Toplu işlem" })).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /Toplu işlem — 2 kullanıcı seçildi/ })).toBeVisible();
    await dialog.getByLabel("İşlem").selectOption("revoke_role");
    await expect(dialog.getByText("Kullanıcı (admin yasak)")).toBeVisible();
    await expect(dialog.getByText("Etki: 2 kullanıcı · 2 atlanacak")).toBeVisible();
    await dialog.getByRole("button", { name: "Uygula" }).click();
    await expect(dialog.getByText("0 güncellendi")).toBeVisible();
    await expect(dialog.getByText("user-001 — tüm roller kaldırılamaz")).toBeVisible();
    await expect(dialog.getByText("user-002 — tüm roller kaldırılamaz")).toBeVisible();
    await dialog.getByRole("button", { name: "Kapat" }).last().click();
    await expect(live).toHaveText("");
  });
});

test.describe("kullanıcı ekle (E3 §e.2)", () => {
  test("doğrulama hataları, admin'siz rol alanı, onay adımı ve yinelenen anahtar", async ({ page }) => {
    await signInAsAdmin(page);
    await openAdmin(page, USER_CREATE);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Yeni kullanıcı" })).toBeVisible();

    // §e.2: rol alanında yalnız `kullanici` vardır ve alan kilitlidir.
    const roleSelect = dialog.locator("select:disabled");
    await expect(roleSelect).toHaveCount(1);
    await expect(roleSelect).toHaveValue("kullanici");
    await expect(roleSelect.locator("option")).toHaveText(["Kullanıcı"]);

    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByRole("alert")).toHaveCount(3);
    await expect(dialog.getByText("Kullanıcı adı veya e-posta girin.")).toBeVisible();
    await expect(dialog.getByText("Görünen ad 2-120 karakter olmalıdır.")).toBeVisible();
    await expect(dialog.getByText("Birim seçin.")).toBeVisible();

    const textInputs = dialog.locator('input[type="text"]');
    await textInputs.nth(0).fill("AB");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByText(/Kullanıcı adı 3-64 karakter/)).toBeVisible();

    await fillCreateUserForm(dialog, "yeni.kullanici.t75");
    await dialog.getByRole("button", { name: "Kaydet" }).click();
    await expect(dialog.getByRole("heading", { name: "Kullanıcıyı oluştur" })).toBeVisible();
    await expect(dialog.getByText("Aşağıdaki bilgilerle yeni kullanıcı oluşturulacak:")).toBeVisible();
    await dialog.getByRole("button", { name: "Onayla" }).click();
    await expect(page).toHaveURL(/#\/admin\/kullanicilar$/);
    await expect(page.getByRole("heading", { name: "Kullanıcılar" })).toBeVisible();

    // Yinelenen eşleme anahtarı (409) forma alan hatası olarak döner.
    await openAdmin(page, USER_CREATE);
    const duplicate = page.getByRole("dialog");
    await fillCreateUserForm(duplicate, "ornek.kullanici.001");
    await duplicate.getByRole("button", { name: "Kaydet" }).click();
    await duplicate.getByRole("button", { name: "Onayla" }).click();
    await expect(duplicate.getByText("Bu kullanıcı adı veya e-posta zaten kayıtlı.")).toBeVisible();
    await expect(duplicate.getByRole("button", { name: "Kaydet" })).toBeVisible();

    // Kaydedilmemiş değişiklikte çıkış onay ister.
    await duplicate.getByRole("button", { name: "Vazgeç" }).click();
    await expect(duplicate.getByText("Kaydedilmemiş değişiklikler silinecek. Çıkmak için tekrar tıklayın.")).toBeVisible();
    await duplicate.getByRole("button", { name: "Vazgeç" }).click();
    await expect(page).toHaveURL(/#\/admin\/kullanicilar$/);
  });
});

test.describe("kullanıcı ayrıntı/düzenle (E3 §e.3)", () => {
  test("genel sekme, askıya alma, geçmiş ve kullanıcı adıyla silme onayı", async ({ page }) => {
    await signInAsAdmin(page);
    await openAdmin(page, userDetail("user-002"));
    await expect(page.getByRole("heading", { name: "Örnek Kullanıcı 002" })).toBeVisible();
    const general = page.getByRole("tabpanel", { name: "Genel" });
    await expect(general.getByText("ornek.kullanici.002")).toBeVisible();
    await expect(general.getByText("3. Sınıf")).toBeVisible();
    await expect(general.getByText("SSO")).toBeVisible();
    await expect(general.getByText("Tanımlı değil")).toBeVisible();
    await expect(general.getByText("2 May 2026 09:00")).toBeVisible();

    await page.getByRole("button", { name: "Askıya al" }).click();
    const suspend = page.getByRole("dialog");
    await expect(suspend.getByRole("heading", { name: "Kullanıcıyı askıya al" })).toBeVisible();
    await expect(suspend.getByText("Bu kullanıcı giriş yapamayacak ve mevcut oturumları sonlanacaktır.")).toBeVisible();
    await suspend.getByRole("button", { name: "Askıya al" }).click();
    await expect(general.getByText("Askıda")).toBeVisible();
    await expect(page.getByRole("button", { name: "Etkinleştir" })).toBeVisible();

    await page.getByRole("tab", { name: "Geçmiş" }).click();
    await expect(page.getByRole("tabpanel", { name: "Geçmiş" }).getByText("Askıya alındı")).toBeVisible();
    await page.getByRole("tab", { name: "Genel" }).click();

    // §e.3: silme "tehlikeli" akıştır; kullanıcı adı birebir yazılmalıdır.
    await page.getByRole("button", { name: "Sil" }).click();
    const remove = page.getByRole("dialog");
    await expect(remove.getByRole("heading", { name: "Kullanıcıyı sil" })).toBeVisible();
    const confirmInput = remove.locator('input[type="text"]');
    await confirmInput.fill("yanlis");
    await expect(remove.getByText("Yazdığınız metin kullanıcı adıyla eşleşmiyor.")).toBeVisible();
    await expect(remove.getByRole("button", { name: "Sil" })).toBeDisabled();
    await confirmInput.fill("ornek.kullanici.002");
    await remove.getByRole("button", { name: "Sil" }).click();
    await expect(general.getByText("Silindi")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sil" })).toHaveCount(0);
  });
});

test.describe("roller ve erişim (E3 §e.6)", () => {
  test("salt okunur özet, yetki matrisi ve admin rolü ver/kaldır", async ({ page }) => {
    await signInAsAdmin(page);
    await openAdmin(page, ROLES);
    await expect(page.getByRole("heading", { name: "Roller ve erişim" })).toBeVisible();
    await expect(
      page.getByText("Rol ataması bu ekrandan yapılmaz; kullanıcı ayrıntısına bağlantı verilir."),
    ).toBeVisible();
    await expect(page.getByText("6 kullanıcı")).toBeVisible();
    await expect(page.getByText("234 kullanıcı")).toBeVisible();
    await expect(page.getByText("Pulse: 172 kullanıcı")).toBeVisible();
    await expect(page.getByText("Ausculta: 154 kullanıcı")).toBeVisible();
    await expect(page.getByText("Opaca: 171 kullanıcı")).toBeVisible();
    await expect(page.getByText("Birimler (sınıflandırma)")).toBeVisible();
    await expect(page.getByText("4. Sınıf")).toBeVisible();
    const roleAssignRow = page.getByRole("row").filter({ hasText: "Rol ata/geri al" });
    await expect(roleAssignRow).toContainText("Evet");
    await expect(page.getByRole("link", { name: "Kullanıcılar listesinde gör" })).toHaveAttribute(
      "href",
      "#/admin/kullanicilar",
    );

    await openAdmin(page, userDetail("user-036"));
    await page.getByRole("tab", { name: "Roller ve erişim" }).click();
    const panel = page.getByRole("tabpanel", { name: "Roller ve erişim" });
    await expect(panel.getByText("Yönetici")).toBeVisible();

    // Oturum sahibi (`dev-admin-0001`, App.tsx:40) bu kayıt OLMADIĞI için
    // self-guard (UserDetailPage.tsx:124) uyarısı çıkmaz ve düğme etkindir;
    // gerçek oturum sahibi mock kullanıcı kayıtlarında bulunmaz (usersDataSource.ts:445).
    await expect(panel.getByText("Kendi admin rolünüzü kaldıramazsınız.")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Admin rolünü kaldır" })).toBeEnabled();

    await panel.getByRole("button", { name: "Admin rolünü kaldır" }).click();
    const revoke = page.getByRole("dialog");
    await expect(revoke.getByRole("heading", { name: "Admin rolünü kaldır" })).toBeVisible();
    await revoke.getByRole("button", { name: "Admin rolünü kaldır" }).click();
    // user-036'nın tek rolü admin'dir; elle kaldırma onu rolsüz bırakır (toplu işlemdeki
    // `would_orphan_roles` koruması yalnız toplu uca aittir, usersDataSource.ts:225).
    await expect(panel.getByRole("button", { name: "Admin rolü ver" })).toBeVisible();
    await expect(panel.locator(".eg-shell-userdetail__badgeList").first().locator("li")).toHaveCount(0);
    await expect(panel.getByText("Yönetici")).toHaveCount(0);

    await panel.getByRole("button", { name: "Admin rolü ver" }).click();
    const grant = page.getByRole("dialog");
    await expect(grant.getByRole("heading", { name: "Admin rolü ver" })).toBeVisible();
    await grant.getByRole("button", { name: "Admin rolü ver" }).click();
    await expect(panel.getByRole("button", { name: "Admin rolünü kaldır" })).toBeEnabled();
    await expect(panel.getByText("Yönetici")).toBeVisible();
  });
});

test.describe("toplu içe aktarma sihirbazı (E3 §e.4/§f)", () => {
  test("adımlar, yükleme hatası, geçersiz satır raporu, uygulama onayı ve sonuç", async ({ page }) => {
    await signInAsAdmin(page);
    await openAdmin(page, IMPORT);
    await expectStep(page, "Şablon");
    await expect(page.getByRole("button", { name: "Şablonu indir" })).toBeVisible();

    await page.getByRole("button", { name: "İleri" }).click();
    await expectStep(page, "Yükle");
    await expect(page.getByRole("button", { name: "İleri" })).toBeDisabled();
    await page.getByRole("button", { name: "Yükle" }).click();
    await expect(page.getByRole("alert")).toHaveText("Dosya boş veya okunamadı.");

    await page.getByLabel("CSV içeriği").fill(IMPORT_CSV);
    await page.getByRole("button", { name: "Yükle" }).click();
    await expect(page.getByText("4 satır algılandı")).toBeVisible();
    await page.getByRole("button", { name: "İleri" }).click();

    await expectStep(page, "Eşle");
    const mapping = page.locator(".eg-shell-import__mapTable select");
    await expect(mapping).toHaveCount(7);
    await expect(mapping.nth(0)).toHaveValue("kullanici_adi");
    await expect(mapping.nth(6)).toHaveValue("giris_tipi");
    await page.getByRole("button", { name: "İleri" }).click();

    await expectStep(page, "Doğrula");
    await expect(page.getByText("1 geçerli · 3 hatalı")).toBeVisible();
    await expect(page.getByText("satır 2 · Kullanıcı adı · Kullanıcı adı veya e-posta girin.")).toBeVisible();
    await expect(page.getByText("satır 2 · Ad soyad · Ad soyad 2-120 karakter olmalıdır.")).toBeVisible();
    await expect(page.getByText("satır 2 · Sim erişimi · Bilinmeyen sim: xyz")).toBeVisible();
    await expect(page.getByText("satır 3 · E-posta · E-posta biçimi geçersiz.")).toBeVisible();
    await expect(page.getByText("satır 3 · Birim kodu · Bilinmeyen birim kodu.")).toBeVisible();
    await expect(page.getByText("satır 4 · Kullanıcı adı · Bu anahtar dosyada tekrar ediyor.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hata raporu (CSV)" })).toBeVisible();

    await page.getByRole("button", { name: "İleri" }).click();
    await expectStep(page, "Önizle");
    await expect(page.getByText("Örnek Öğrenci Yeni — yeni.ogrenci.001")).toBeVisible();
    await page.getByRole("button", { name: "İleri" }).click();
    await expectStep(page, "Uygula");
    await expect(page.getByText("1 yeni kullanıcı oluşturulacak.")).toBeVisible();

    await page.getByRole("button", { name: "Uygula" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "İçe aktarmayı uygula" })).toBeVisible();
    await expect(dialog.getByText("1 kullanıcı oluşturulacak.")).toBeVisible();
    await dialog.getByRole("button", { name: "Uygula" }).click();

    await expectStep(page, "Sonuç");
    await expect(page.getByText("1 uygulandı · 3 hatalı")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hata raporu (CSV)" })).toBeVisible();
    await page.getByRole("button", { name: "Yeni içe aktarma başlat" }).click();
    await expectStep(page, "Şablon");
  });
});

test.describe("denetim günlüğü (E3 §e.7)", () => {
  test("filtre, boş durum, sayfalama ve kayıt ayrıntısı", async ({ page }) => {
    await signInAsAdmin(page);
    await openAdmin(page, AUDIT);
    await expect(page.getByRole("heading", { name: "Denetim günlüğü" })).toBeVisible();
    await expect(page.getByText("1–20 / 140 kayıt")).toBeVisible();

    await selectAdminFilterOption(page, "Eylem", "İmha işi çalıştı");
    await expect(page.getByText("1–20 / 23 kayıt")).toBeVisible();
    await expect(listRows(page).first()).toContainText("İmha işi çalıştı");
    await expect(listRows(page).first()).toContainText("Sistem");
    await expect(listRows(page).first()).toContainText("—");

    await clickAdminFilterButton(page, "Filtreleri temizle");
    await fillAdminFilter(page, "Aktör", "Örnek Yönetici 001");
    await expect(page.getByText("1–20 / 22 kayıt")).toBeVisible();
    await expect(listRows(page).first()).toContainText("Örnek Yönetici 001");

    await clickAdminFilterButton(page, "Filtreleri temizle");
    await fillAdminFilter(page, "Bitiş", "2026-01-01");
    await expect(page.getByText("Bu filtrelerle sonuç bulunamadı.")).toBeVisible();
    await clickAdminFilterButton(page, "Filtreleri temizle");
    await expect(page.getByText("1–20 / 140 kayıt")).toBeVisible();

    await visible(page.getByRole("button", { name: "Ayrıntı" })).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Kayıt ayrıntısı" })).toBeVisible();
    await dialog.getByRole("button", { name: "Kapat" }).last().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("admin rota koruması", () => {
  test("öğrenci oturumu tüm /admin rotalarında reddedilir", async ({ page }) => {
    await signInAsStudent(page);
    for (const hash of ADMIN_ROUTES) {
      await page.goto(`/${hash}`);
      await expect(page, `${hash} öğrenciye kapalı olmalı`).toHaveURL(/#\/giris\/admin$/);
      await expect(page.getByRole("heading", { name: "Yönetici girişi" })).toBeVisible();
    }
  });
});

test.describe("admin ekranları: axe 0, yatay taşma yok, artefaktlar", () => {
  interface AdminState {
    readonly key: string;
    readonly setup: (page: Page) => Promise<void>;
  }

  const states: readonly AdminState[] = [
    { key: "#/admin", setup: (page) => openAdmin(page, "#/admin") },
    {
      key: USERS,
      setup: async (page) => {
        await openAdmin(page, USERS);
        await expect(page.getByText("1–20 / 240 kayıt")).toBeVisible();
      },
    },
    {
      key: `${USERS}#secim-toplu-islem`,
      setup: async (page) => {
        await openAdmin(page, USERS);
        await expect(page.getByText("1–20 / 240 kayıt")).toBeVisible();
        await visible(page.getByRole("checkbox")).first().check();
        await visible(page.getByRole("button", { name: "Toplu işlem" })).click();
        await expect(page.getByRole("dialog")).toBeVisible();
      },
    },
    {
      key: `${USER_CREATE}#dogrulama-hatalari`,
      setup: async (page) => {
        await openAdmin(page, USER_CREATE);
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Kaydet" }).click();
        await expect(dialog.getByRole("alert")).toHaveCount(3);
      },
    },
    {
      key: `${USER_CREATE}#onay-adimi`,
      setup: async (page) => {
        await openAdmin(page, USER_CREATE);
        const dialog = page.getByRole("dialog");
        await fillCreateUserForm(dialog, "onay.kullanici.t75");
        await dialog.getByRole("button", { name: "Kaydet" }).click();
        await expect(dialog.getByRole("heading", { name: "Kullanıcıyı oluştur" })).toBeVisible();
      },
    },
    {
      key: `${userDetail("user-002")}#genel`,
      setup: async (page) => {
        await openAdmin(page, userDetail("user-002"));
        await expect(page.getByRole("heading", { name: "Örnek Kullanıcı 002" })).toBeVisible();
      },
    },
    {
      key: `${userDetail("user-002")}#roller`,
      setup: async (page) => {
        await openAdmin(page, userDetail("user-002"));
        await page.getByRole("tab", { name: "Roller ve erişim" }).click();
        await expect(page.getByRole("tabpanel", { name: "Roller ve erişim" })).toBeVisible();
      },
    },
    {
      key: `${userDetail("user-002")}#silme-onayi`,
      setup: async (page) => {
        await openAdmin(page, userDetail("user-002"));
        await page.getByRole("button", { name: "Sil" }).click();
        const dialog = page.getByRole("dialog");
        await dialog.locator('input[type="text"]').fill("yanlis");
        await expect(dialog.getByText("Yazdığınız metin kullanıcı adıyla eşleşmiyor.")).toBeVisible();
      },
    },
    {
      key: `${IMPORT}#sablon`,
      setup: async (page) => {
        await openAdmin(page, IMPORT);
        await expectStep(page, "Şablon");
      },
    },
    {
      key: `${IMPORT}#yukleme-hatasi`,
      setup: async (page) => {
        await openAdmin(page, IMPORT);
        await page.getByRole("button", { name: "İleri" }).click();
        await page.getByRole("button", { name: "Yükle" }).click();
        await expect(page.getByRole("alert")).toHaveText("Dosya boş veya okunamadı.");
      },
    },
    { key: `${IMPORT}#dogrulama`, setup: importToValidate },
    { key: `${IMPORT}#uygula-onayi`, setup: importToApplyConfirm },
    {
      key: `${IMPORT}#sonuc`,
      setup: async (page) => {
        await importToApplyConfirm(page);
        await page.getByRole("dialog").getByRole("button", { name: "Uygula" }).click();
        await expectStep(page, "Sonuç");
      },
    },
    {
      key: ROLES,
      setup: async (page) => {
        await openAdmin(page, ROLES);
        await expect(page.getByRole("heading", { name: "Roller ve erişim" })).toBeVisible();
      },
    },
    {
      key: AUDIT,
      setup: async (page) => {
        await openAdmin(page, AUDIT);
        await expect(page.getByText("1–20 / 140 kayıt")).toBeVisible();
      },
    },
    {
      key: `${AUDIT}#kayit-ayrintisi`,
      setup: async (page) => {
        await openAdmin(page, AUDIT);
        await expect(page.getByText("1–20 / 140 kayıt")).toBeVisible();
        await visible(page.getByRole("button", { name: "Ayrıntı" })).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
      },
    },
  ];

  test("her admin ekranı axe 0 ve taşmasız; ekran görüntüsü + axe raporu üretilir", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors = trackErrors(page);
    await signInAsAdmin(page);
    for (const state of states) {
      await state.setup(page);
      await captureRouteScreenshot(page, testInfo.project.name, state.key);
      const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
      const violations = results.violations.map((violation) => ({
        help: violation.help,
        id: violation.id,
        impact: violation.impact,
        targets: violation.nodes.flatMap((node) => node.target).slice(0, 5),
      }));
      await writeAxeArtifact(testInfo.project.name, state.key, violations);
      expect(violations, `axe ihlalleri: ${state.key}`).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow, `yatay taşma: ${state.key}`).toBe(false);
      // Vite HMR soketi her tam sayfa geçişinde kapanırken düşen dev-sunucusu
      // gürültüsü ayıklanır; uygulama kaynaklı hatalar aynen kapıyı kırar.
      const appErrors = errors.filter((error) => !error.includes("WebSocket connection to 'ws://"));
      expect(appErrors, `konsol/sayfa hatası: ${state.key}`).toEqual([]);
    }
  });
});
