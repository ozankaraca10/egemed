import { describe, expect, it } from "vitest";
import type { LearnActivity } from "../../../packages/gamification-core/src/types";
import { evaluateBadges } from "../../../packages/gamification-core/src/badges";
import { OPACA_BADGES } from "../../../packages/sim-opaca/src/gamification/catalog";
import { DUEL_BADGES } from "../../../packages/gami-catalogs/src/index";
import { CT_STACKS_ITEM_KEY } from "../../../packages/sim-opaca/src/gamification/attempt";
import { computeStats } from "../../../packages/sim-opaca/src/gamification/stats";
import { attempt } from "./helpers";

const now = new Date("2026-09-23T10:00:00Z");
const learn0: LearnActivity = { topics: [], items: {} };
const statsOf = (list = [attempt()], learn: LearnActivity = learn0, earned: { id: string; at: string }[] = []) =>
  computeStats(list, learn, earned, now);
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
const ctx = { now };

describe("rozetler", () => {
  it("37 rozet, benzersiz kimlik, 6 kategori; düello rozetleri T221'dedir", () => {
    expect(OPACA_BADGES).toHaveLength(37);
    expect(new Set(ids(OPACA_BADGES)).size).toBe(37);
    expect(new Set(OPACA_BADGES.map((b) => b.category))).toEqual(
      new Set(["topic", "skill", "streak", "learn", "milestone", "challenge"]),
    );
    expect(OPACA_BADGES.filter((badge) => badge.category === "challenge").map((badge) => badge.id)).toEqual(
      DUEL_BADGES.map((badge) => badge.id),
    );
  });
  it("ilk değerlendirme → İlk Adım; eşik tam 80 → Eşik Aşıldı, 79 değil", () => {
    expect(ids(evaluateBadges(OPACA_BADGES, statsOf([attempt({ score: 79 })]), [], ctx))).toContain("first-step");
    expect(ids(evaluateBadges(OPACA_BADGES, statsOf([attempt({ score: 79 })]), [], ctx))).not.toContain("threshold");
    expect(ids(evaluateBadges(OPACA_BADGES, statsOf([attempt({ score: 80 })]), [], ctx))).toContain("threshold");
  });
  it("Keskin Göz kademeleri tam sınırda (9 → yok, 10 → bronz, 25 → gümüş)", () => {
    expect(ids(evaluateBadges(OPACA_BADGES, statsOf([attempt({ localizationHits: 9 })]), [], ctx))).not.toContain(
      "sharp-eye-1",
    );
    const at10 = ids(evaluateBadges(OPACA_BADGES, statsOf([attempt({ localizationHits: 10 })]), [], ctx));
    expect(at10).toContain("sharp-eye-1");
    expect(at10).not.toContain("sharp-eye-2");
    expect(ids(evaluateBadges(OPACA_BADGES, statsOf([attempt({ localizationHits: 25 })]), [], ctx))).toEqual(
      expect.arrayContaining(["sharp-eye-1", "sharp-eye-2"]),
    );
  });
  it("beceri/konu sayaçları yalnız değerlendirmeden beslenir", () => {
    const s = statsOf([
      attempt({
        mode: "practice",
        localizationHits: 50,
        findings: [{ finding: "pneumothorax", correct: true }],
      }),
    ]);
    expect(s.localizationHits).toBe(0);
    expect(s.topicCorrect.pleura).toBe(0);
  });
  it("konu eşlemesi findings.json gruplarından; kemik rozeti yalnız kırık; eşleşmeyen bulgu yok sayılır", () => {
    const s = statsOf([
      attempt({
        findings: [
          { finding: "pneumothorax", correct: true },
          { finding: "pleural_effusion", correct: true },
          { finding: "pleural_effusion", correct: false },
          { finding: "rib_fracture", correct: true },
          { finding: "scoliosis", correct: true },
          { finding: "bilinmeyen_bulgu", correct: true },
          { finding: "tuberculosis_cavity", correct: true },
        ],
      }),
    ]);
    expect(s.topicCorrect.pleura).toBe(2);
    expect(s.topicCorrect.bone).toBe(1);
    expect(s.topicCorrect.tb).toBe(1);
  });
  it("kazanılmış rozet geri alınmaz ve yeniden verilmez; Podyum v1'de kazanılamaz", () => {
    const prev = [{ id: "first-step", at: "2026-09-01T00:00:00Z" }];
    const again = evaluateBadges(OPACA_BADGES, statsOf([attempt()]), prev, ctx);
    expect(ids(again)).not.toContain("first-step");
    expect(ids(again)).not.toContain("podium");
  });
  it("öğrenme rozetleri: 10 konu → Öğrenme Kaşifi, 1 BT yığını → BT Kaşifi", () => {
    const learn = {
      topics: Array.from({ length: 10 }, (_, i) => `t${i}`),
      items: { [CT_STACKS_ITEM_KEY]: ["tcia_ct_intro_01"] },
    };
    const got = ids(evaluateBadges(OPACA_BADGES, statsOf([], learn), [], ctx));
    expect(got).toEqual(expect.arrayContaining(["explorer", "ct-explorer"]));
  });
  it("kazanım zamanı verilen now", () => {
    expect(evaluateBadges(OPACA_BADGES, statsOf(), [], ctx)[0]?.at).toBe(now.toISOString());
  });
});
