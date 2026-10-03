import { describe, expect, it } from "vitest";
import { AUSCULTA_BADGES, OPACA_BADGES, PULSE_BADGES } from "../../packages/gami-catalogs/src/index";
import { capstoneRequiredBadges } from "../../packages/gamification-core/src/index";

// T277 — her sim kataloğu tam 40 rozet: 39 normal (en kolaydan en zora) + capstone (son öğe).
// Eski kimlikler `gami_badges` kayıtlarının anahtarıdır; bu liste bir uyumluluk sözleşmesidir.

const LEGACY_IDS: Readonly<Record<string, readonly string[]>> = {
  pulse: [
    "rhythm-streak-3", "rhythm-streak-10", "rhythm-streak-25", "twelve-leads",
    "caliper-1", "caliper-2", "caliper-3",
    "mode-normal", "mode-af", "mode-stemi", "mode-pvc", "mode-svt", "mode-inferior", "mode-vt",
    "mode-vf", "mode-pat", "mode-flutter", "mode-sintach", "mode-lbbb", "mode-rbbb",
    "duel-first", "duel-first-win", "duel-wins-3", "duel-wins-10", "duel-wins-25",
    "duel-rematch", "duel-rivals-3", "duel-rivals-10", "duel-rivals-25",
  ],
  ausculta: [
    "listen-3", "listen-8", "listen-20", "systematic-1", "systematic-5", "systematic-15",
    "cardiac-foci", "posterior-lung", "heart-normal", "heart-extra", "murmur-timing",
    "rhythm-findings", "lung-vesicular", "lung-continuous", "lung-crackles", "pleural-rub",
    "pediatric", "mixed-sounds", "head-choice", "diagnosis-3",
    "duel-first", "duel-first-win", "duel-wins-3", "duel-wins-10", "duel-wins-25",
    "duel-rematch", "duel-rivals-3", "duel-rivals-10", "duel-rivals-25",
  ],
  opaca: [
    "sharp-eye-1", "sharp-eye-2", "sharp-eye-3", "systematic", "film-quality", "fast-accurate",
    "interpreter", "pleura", "cardiac", "nodule", "tb", "diaphragm", "bone", "vascular", // T321a: "pediatric" kaldırıldı (depo sahibi)
    "streak-3", "streak-7", "streak-30", "marathon", "explorer", "ct-explorer", "practice-grit",
    "first-step", "threshold", "no-hints", "perfect", "all-topics",
    "duel-first", "duel-first-win", "duel-wins-3", "duel-wins-10", "duel-wins-25",
    "duel-rematch", "duel-rivals-3", "duel-rivals-10", "duel-rivals-25",
  ],
};

const CATALOGS = [
  { sim: "pulse", badges: PULSE_BADGES },
  { sim: "ausculta", badges: AUSCULTA_BADGES },
  { sim: "opaca", badges: OPACA_BADGES },
] as const;

describe("40 rozet katalogları (T277)", () => {
  for (const { sim, badges } of CATALOGS) {
    it(`${sim}: 40 öğe, son öğe capstone, kimlikler tekil, eski kimlikler korunmuş`, () => {
      expect(badges).toHaveLength(40);
      expect(new Set(badges.map((badge) => badge.id)).size).toBe(40);
      expect(badges.at(-1)).toMatchObject({ id: "gercek-rozet", capstone: true });
      expect(badges.filter((badge) => badge.capstone === true)).toHaveLength(1);
      const ids = new Set(badges.map((badge) => badge.id));
      for (const legacy of LEGACY_IDS[sim]!) expect(ids.has(legacy), legacy).toBe(true);
    });
  }

  it("capstone üç simde de 39 rozetin tamamını şart koşar (kazanılamayan rozet yok)", () => {
    // Depo sahibi: 40. rozet yalnız diğer 39'un TAMAMI kazanılınca gelir. Kazanılamayan
    // "Podyum" bu yüzden kazanılabilir geçici rozetle değiştirildi (T277 incelemesi).
    const opacaRequired = capstoneRequiredBadges(OPACA_BADGES).map((badge) => badge.id);
    expect(opacaRequired).toHaveLength(39);
    expect(capstoneRequiredBadges(PULSE_BADGES)).toHaveLength(39);
    expect(capstoneRequiredBadges(AUSCULTA_BADGES)).toHaveLength(39);
  });
});
