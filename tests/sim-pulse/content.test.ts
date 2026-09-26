import { readFileSync } from "node:fs";
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

    const manifest = JSON.parse(readFileSync("packages/sim-pulse/src/runtime/vendor/manifest.json", "utf8")) as {
      patches: { file: string; id: string; matches: number }[];
    };
    const patch = manifest.patches.find((entry) => entry.id === "PULSE-ADR006-SCORM-TEXT");
    expect(patch).toMatchObject({ file: "app.js", id: "PULSE-ADR006-SCORM-TEXT", matches: 1 });
  });

  it("sınav açıklamasında LMS'ye yazılır ifadesi yok (T160)", () => {
    const appVendor = readFileSync("packages/sim-pulse/src/runtime/vendor/app.js", "utf8");
    expect(appVendor).not.toContain("LMS’ye yazılır");
    expect(appVendor).toContain("en iyi puan kaydedilir");

    const manifest = JSON.parse(readFileSync("packages/sim-pulse/src/runtime/vendor/manifest.json", "utf8")) as {
      patches: { file: string; id: string; matches: number }[];
    };
    const patch = manifest.patches.find((entry) => entry.id === "PULSE-NO-LMS-QUIZ-TEXT");
    expect(patch).toMatchObject({ file: "app.js", id: "PULSE-NO-LMS-QUIZ-TEXT", matches: 1 });
  });
});
