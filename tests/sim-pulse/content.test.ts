import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODES, PULSE_MODE_CONTENT } from "../../packages/sim-pulse/src/index";

describe("Pulse mod içerikleri", () => {
  it("13 modu başlık, özet, ipucu, not ve üç authored kartla kapsar", () => {
    expect(Object.keys(PULSE_MODE_CONTENT)).toEqual(MODES);
    for (const mode of MODES) {
      const content = PULSE_MODE_CONTENT[mode];
      expect(content.title).not.toBe("");
      expect(content.summary).not.toBe("");
      expect(content.lead).not.toBe("");
      expect(content.clues).toHaveLength(3);
      expect(content.cards).toHaveLength(3);
      expect(content.cards.every(([title, body]) => title.length > 0 && body.length > 0)).toBe(true);
    }
  });

  it("kaynağın eğitim amaçlı güvenlik ve içerik ifadelerini korur", () => {
    expect(PULSE_MODE_CONTENT.vf.title).toBe("Ventriküler fibrilasyon");
    expect(PULSE_MODE_CONTENT.vf.note).toContain("resüsitasyon ve defibrilasyon");
    expect(PULSE_MODE_CONTENT.stemi.note).toContain("tek başına MI tanısı koydurmaz");
    expect(PULSE_MODE_CONTENT.normal.cards[0]?.[0]).toBe("EKG özellikleri");
  });
});

describe("Pulse vendor çıktısı (T138)", () => {
  it("açılış kodu tam ekran önerisini göstermez (T139)", () => {
    const landingVendor = readFileSync("packages/sim-pulse/src/runtime/vendor/landing.js", "utf8");
    expect(landingVendor).not.toContain("$('fullscreenPrompt')?.showModal()");
  });

  it("sınav mod kartında kullanıcıya görünen SCORM ifadesi yok", () => {
    const appVendor = readFileSync("packages/sim-pulse/src/runtime/vendor/app.js", "utf8");
    expect(appVendor).not.toContain("SCORM");
    expect(appVendor).toContain("Puan kaydedilir");
  });

  it("sınav açıklamasında LMS'ye yazılır ifadesi yok (T160)", () => {
    const appVendor = readFileSync("packages/sim-pulse/src/runtime/vendor/app.js", "utf8");
    expect(appVendor).not.toContain("LMS’ye yazılır");
    expect(appVendor).toContain("en iyi puan kaydedilir");
  });

  it("SCORM/LMS kalıntısı kullanıcıya görünen yüzeylerde kalmaz (T278)", () => {
    for (const file of ["app.js", "features.js", "landing.js", "markup.js"]) {
      const source = readFileSync(`packages/sim-pulse/src/runtime/vendor/${file}`, "utf8");
      expect(source, file).not.toMatch(/SCORM|LMS/);
    }
  });

  it("vendor platform kaynağıdır: üretilmiş dosya işareti ve manifest yok (ADR-011)", () => {
    const dir = "packages/sim-pulse/src/runtime/vendor";
    const files = readdirSync(dir);
    expect(files).not.toContain("manifest.json");
    for (const file of files) {
      expect(readFileSync(`${dir}/${file}`, "utf8"), file).not.toContain("ÜRETİLMİŞ DOSYA");
    }
  });
});
