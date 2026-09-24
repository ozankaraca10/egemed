import { t, tr, type TrKey } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

const devAuthKeys: TrKey[] = [
  "entry.dev.title",
  "entry.dev.admin",
  "entry.dev.student",
  "entry.dev.note",
  "entry.error.invalid",
  "shell.session.admin",
  "shell.session.student",
  "shell.session.logout",
  "shell.session.banner",
];

const adminKeys: TrKey[] = [
  "admin.title",
  "admin.intro",
  "admin.soon",
  "admin.section.overview",
  "admin.section.users",
  "admin.section.roles",
  "admin.section.sims",
  "admin.section.integrations",
  "admin.section.audit",
  "admin.section.overview.desc",
  "admin.section.users.desc",
  "admin.section.roles.desc",
  "admin.section.sims.desc",
  "admin.section.integrations.desc",
  "admin.section.audit.desc",
];

const premiumKeys: TrKey[] = [
  "shell.brand.eyebrow",
  "shell.brand.name",
  "shell.brand.tagline",
  "shell.brand.full",
  "home.hero.title",
  "home.hero.lead",
  "home.hero.cta",
  "home.hero.secondary",
  "home.greeting",
  "home.progress.title",
  "home.progress.empty",
  "home.trust.title",
  "home.trust.data.title",
  "home.trust.data.body",
  "home.trust.faculty.title",
  "home.trust.faculty.body",
  "home.trust.privacy.title",
  "home.trust.privacy.body",
  "sims.pulse.name",
  "sims.pulse.tagline",
  "sims.pulse.body",
  "sims.ausculta.name",
  "sims.ausculta.tagline",
  "sims.ausculta.body",
  "sims.opaca.name",
  "sims.opaca.tagline",
  "sims.opaca.body",
  "sims.open",
  "sims.soon",
  "footer.nav.label",
  "footer.institution",
  "footer.rights",
];

const simErrorKeys: TrKey[] = [
  "sims.error.title",
  "sims.error.body",
  "sims.error.retry",
  "sims.loading",
];

const howKeys: TrKey[] = [
  "home.how.title",
  "home.how.learn.title",
  "home.how.learn.body",
  "home.how.practice.title",
  "home.how.practice.body",
  "home.how.assess.title",
  "home.how.assess.body",
];

describe("i18n/tr sözlüğü", () => {
  it("her değer boş olmayan bir dizedir", () => {
    const entries = Object.entries(tr);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(typeof value, key).toBe("string");
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("t() anahtarı doğru Türkçe değere çözer", () => {
    expect(t("badge.tone.info")).toBe("Bilgi");
    expect(t("badge.tone.success")).toBe("Başarılı");
    expect(t("badge.tone.warning")).toBe("Uyarı");
    expect(t("badge.tone.danger")).toBe("Hata");
    expect(t("modal.close")).toBe("Kapat");
  });

  it("sahte giriş anahtarları tanımlı ve boş değil", () => {
    for (const key of devAuthKeys) {
      expect(t(key).trim().length, key).toBeGreaterThan(0);
    }
    expect(t("entry.error.invalid")).toBe("Kullanıcı adı veya parola hatalı.");
    expect(t("shell.session.logout")).toBe("Çıkış yap");
  });

  it("admin anahtarları tanımlı ve boş değil", () => {
    for (const key of adminKeys) {
      expect(t(key).trim().length, key).toBeGreaterThan(0);
    }
    expect(t("admin.soon")).toBe("Yakında");
    expect(t("admin.section.overview")).toBe("Özet");
  });

  it("admin metinleri iki rollü modele göre birebir yazılmıştır", () => {
    expect(t("admin.intro")).toBe(
      "Kullanıcıları, simülatör erişimini ve denetim kayıtlarını buradan yöneteceksiniz. Bölümler kullanıcı yönetimi altyapısıyla birlikte açılacak.",
    );
    expect(t("admin.section.overview")).toBe("Özet");
    expect(t("admin.section.users")).toBe("Kullanıcılar");
    expect(t("admin.section.roles")).toBe("Toplu içe aktarma");
    expect(t("admin.section.sims")).toBe("Simülatör erişimi");
    expect(t("admin.section.integrations")).toBe("Entegrasyonlar");
    expect(t("admin.section.audit")).toBe("Denetim günlüğü");
    expect(t("admin.section.overview.desc")).toBe(
      "Kullanıcı sayıları, son girişler ve bekleyen işler; bireysel öğrenci puanı gösterilmez.",
    );
    expect(t("admin.section.users.desc")).toBe(
      "Kullanıcı ekleme, düzenleme, askıya alma; giriş tipi (SSO) seçimi.",
    );
    expect(t("admin.section.roles.desc")).toBe(
      "CSV şablonuyla toplu kullanıcı ekleme ve güncelleme; satır bazlı doğrulama raporu.",
    );
    expect(t("admin.section.sims.desc")).toBe(
      "Kullanıcı ve grup bazında Pulse, Ausculta ve Opaca erişimi.",
    );
    expect(t("admin.section.integrations.desc")).toBe(
      "SSO ve LRS bağlantı durumu; sır değerleri ekranda gösterilmez.",
    );
    expect(t("admin.section.audit.desc")).toBe(
      "Yönetici eylemlerinin değiştirilemez kaydı.",
    );
  });

  it("'Nasıl çalışır?' bölümü anahtarları tanımlı ve birebir metinleri taşır", () => {
    for (const key of howKeys) {
      expect(t(key).trim().length, key).toBeGreaterThan(0);
    }
    expect(t("home.how.title")).toBe("Nasıl çalışır?");
    expect(t("home.how.learn.title")).toBe("İnceleme");
    expect(t("home.how.learn.body")).toBe(
      "Konuyu sistematik okuma rehberiyle, gerçek örnekler üzerinde keşfedin.",
    );
    expect(t("home.how.practice.title")).toBe("Uygulama");
    expect(t("home.how.practice.body")).toBe(
      "Vakalarda bulguları kendiniz işaretleyin; her adımda anında geri bildirim alın.",
    );
    expect(t("home.how.assess.title")).toBe("Değerlendirme");
    expect(t("home.how.assess.body")).toBe(
      "Rastgele vaka setiyle kendinizi sınayın; alan bazlı performansınızı görün.",
    );
  });

  it("sim hata ve yükleme anahtarları tanımlı ve birebir metinleri taşır", () => {
    for (const key of simErrorKeys) {
      expect(t(key).trim().length, key).toBeGreaterThan(0);
    }
    expect(t("sims.error.title")).toBe("Simülatör açılamadı");
    expect(t("sims.error.body")).toBe(
      "Bağlantınızı kontrol edip yeniden deneyin. Sorun sürerse kurum BT birimine başvurun.",
    );
    expect(t("sims.error.retry")).toBe("Tekrar dene");
    expect(t("sims.loading")).toBe("Simülatör yükleniyor…");
  });

  it("premium platform anahtarları tanımlı ve boş değil", () => {
    for (const key of premiumKeys) {
      expect(t(key).trim().length, key).toBeGreaterThan(0);
    }
    expect(t("shell.brand.eyebrow")).toBe("Ege Üniversitesi Tıp Fakültesi");
    expect(t("shell.brand.name")).toBe("EGEMED");
    expect(t("shell.brand.tagline")).toBe("Klinik Öğrenme Deneyimi Platformu");
    expect(t("shell.brand.full")).toBe("EGEMED Klinik Öğrenme Deneyimi Platformu");
    expect(t("home.greeting")).toBe("Hoş geldiniz");
    expect(t("home.hero.cta")).toBe("Simülatörlere git");
    expect(t("sims.open")).toBe("Simülatörü aç");
    expect(t("sims.soon")).toBe("Platforma taşınıyor");
    expect(t("footer.nav.label")).toBe("Alt bilgi");
    expect(t("footer.institution")).toBe("Ege Üniversitesi Tıp Fakültesi");
  });

  it("ad değişikliği: marka metinleri EGEMED adını taşır", () => {
    expect(t("entry.brand")).toBe("EGEMED");
    expect(t("entry.tagline")).toBe("Klinik öğrenme deneyimi tek platformda.");
    expect(t("shell.brand")).toBe("EGEMED");
    expect(t("shell.home.body")).toBe(
      "EGEMED Klinik Öğrenme Deneyimi Platformu'na hoş geldiniz.",
    );
    expect(t("footer.rights")).toBe("EGEMED · Eğitim amaçlıdır, tanı aracı değildir.");
  });

  it("sözlükteki hiçbir değer 'clix' içermez (büyük/küçük harf duyarsız)", () => {
    for (const [key, value] of Object.entries(tr)) {
      expect(value.toLowerCase().includes("clix"), key).toBe(false);
    }
  });
});
