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
  "footer.institution",
  "footer.rights",
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

  it("premium platform anahtarları tanımlı ve boş değil", () => {
    for (const key of premiumKeys) {
      expect(t(key).trim().length, key).toBeGreaterThan(0);
    }
    expect(t("shell.brand.eyebrow")).toBe("EGEMED");
    expect(t("shell.brand.name")).toBe("CLIX");
    expect(t("shell.brand.tagline")).toBe("Klinik Öğrenme Platformu");
    expect(t("home.greeting")).toBe("Hoş geldiniz");
    expect(t("home.hero.cta")).toBe("Simülatörlere git");
    expect(t("sims.open")).toBe("Simülatörü aç");
    expect(t("sims.soon")).toBe("Platforma taşınıyor");
    expect(t("footer.institution")).toBe("Ege Üniversitesi Tıp Fakültesi");
  });
});
