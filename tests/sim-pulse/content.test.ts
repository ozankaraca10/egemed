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
