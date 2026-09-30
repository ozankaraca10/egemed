import { describe, expect, it } from "vitest";
import {
  buildFlagSignals,
  computeCaseSignals,
  integrityScore,
  isConsistentFast,
  median,
  shouldFlag,
} from "../../apps/api/src/integrity/signals";
import { INTEGRITY_FLAG_SCORE_THRESHOLD, SIGNAL_WEIGHTS, TOO_FAST_THRESHOLD_MS } from "../../apps/api/src/integrity/thresholds";

// T283a — saf sinyal hesapları birim testi. Bu katman DB/HTTP olmadan hesaplanır;
// oturum/API akışı `integrity-flagging.test.ts`'de tek sefer doğrulanır (TEST-POLİTİKASI
// §1: aynı senaryoyu katman katman tekrarlama, hatayı en ucuz yakalayan katmanda yaz).

const INTEGRITY_ZERO = { hiddenCount: 0, hiddenMs: 0, blurCount: 0, pasteCount: 0, interactions: 5 };

describe("computeCaseSignals — too_fast", () => {
  it("doğru yanıt eşiğin altındaysa too_fast üretir (sim başına farklı eşik)", () => {
    for (const simId of ["pulse", "opaca", "ausculta"] as const) {
      const threshold = TOO_FAST_THRESHOLD_MS[simId];
      const signals = computeCaseSignals({ simId, mastery: true, latencyMs: threshold - 1, noListenedPoints: false, integrity: INTEGRITY_ZERO });
      expect(signals, simId).toContain("too_fast");
    }
  });

  it("eşiğe eşit ya da üstündeyse too_fast üretmez", () => {
    const threshold = TOO_FAST_THRESHOLD_MS.ausculta;
    const signals = computeCaseSignals({ simId: "ausculta", mastery: true, latencyMs: threshold, noListenedPoints: false, integrity: INTEGRITY_ZERO });
    expect(signals).not.toContain("too_fast");
  });

  it("yanlış yanıtta (mastery false) hiç too_fast üretmez — süre ne olursa olsun", () => {
    const signals = computeCaseSignals({ simId: "ausculta", mastery: false, latencyMs: 0, noListenedPoints: false, integrity: INTEGRITY_ZERO });
    expect(signals).not.toContain("too_fast");
  });
});

describe("computeCaseSignals — no_interaction_correct", () => {
  it("interactions === 0 ve doğruysa üretir", () => {
    const signals = computeCaseSignals({
      simId: "opaca",
      mastery: true,
      latencyMs: 999_999,
      noListenedPoints: false,
      integrity: { ...INTEGRITY_ZERO, interactions: 0 },
    });
    expect(signals).toContain("no_interaction_correct");
  });

  it("interactions > 0 ise üretmez", () => {
    const signals = computeCaseSignals({
      simId: "opaca",
      mastery: true,
      latencyMs: 999_999,
      noListenedPoints: false,
      integrity: { ...INTEGRITY_ZERO, interactions: 1 },
    });
    expect(signals).not.toContain("no_interaction_correct");
  });

  it("Ausculta'da integrity yoksa bile hiç dinlenmiş nokta yoksa ve doğruysa üretir (mevcut heardPoints kontrolüyle tutarlı)", () => {
    const signals = computeCaseSignals({ simId: "ausculta", mastery: true, latencyMs: 999_999, noListenedPoints: true, integrity: undefined });
    expect(signals).toContain("no_interaction_correct");
  });

  it("yanlış yanıtta interactions === 0 olsa bile üretmez", () => {
    const signals = computeCaseSignals({
      simId: "opaca",
      mastery: false,
      latencyMs: 999_999,
      noListenedPoints: false,
      integrity: { ...INTEGRITY_ZERO, interactions: 0 },
    });
    expect(signals).not.toContain("no_interaction_correct");
  });
});

describe("computeCaseSignals — tab_hidden / blur_many / paste", () => {
  it("tab_hidden: sayı VE süre birlikte eşiği aşmalı", () => {
    const base = { simId: "pulse" as const, mastery: false, latencyMs: 999_999, noListenedPoints: false };
    expect(computeCaseSignals({ ...base, integrity: { ...INTEGRITY_ZERO, hiddenCount: 1, hiddenMs: 3000 } })).toContain("tab_hidden");
    expect(computeCaseSignals({ ...base, integrity: { ...INTEGRITY_ZERO, hiddenCount: 1, hiddenMs: 2999 } })).not.toContain("tab_hidden");
    expect(computeCaseSignals({ ...base, integrity: { ...INTEGRITY_ZERO, hiddenCount: 0, hiddenMs: 5000 } })).not.toContain("tab_hidden");
  });

  it("blur_many: eşik 3 odak kaybı", () => {
    const base = { simId: "pulse" as const, mastery: false, latencyMs: 999_999, noListenedPoints: false };
    expect(computeCaseSignals({ ...base, integrity: { ...INTEGRITY_ZERO, blurCount: 3 } })).toContain("blur_many");
    expect(computeCaseSignals({ ...base, integrity: { ...INTEGRITY_ZERO, blurCount: 2 } })).not.toContain("blur_many");
  });

  it("paste: tek olay yeterli", () => {
    const base = { simId: "pulse" as const, mastery: false, latencyMs: 999_999, noListenedPoints: false };
    expect(computeCaseSignals({ ...base, integrity: { ...INTEGRITY_ZERO, pasteCount: 1 } })).toContain("paste");
    expect(computeCaseSignals({ ...base, integrity: { ...INTEGRITY_ZERO, pasteCount: 0 } })).not.toContain("paste");
  });

  it("integrity alanı yoksa (eski istemci) tab_hidden/blur_many/paste hiç üretilmez", () => {
    const signals = computeCaseSignals({ simId: "pulse", mastery: true, latencyMs: 999_999, noListenedPoints: false, integrity: undefined });
    expect(signals).toEqual([]);
  });
});

describe("isConsistentFast", () => {
  const fastAusculta = { simId: "ausculta" as const, correctRate: 95, medianLatencyMs: 1000 };

  it("son 3 oturumun hepsi yüksek doğruluk + düşük medyan gecikme taşıyorsa true", () => {
    expect(isConsistentFast([fastAusculta, fastAusculta, fastAusculta])).toBe(true);
  });

  it("3'ten az oturum varsa false", () => {
    expect(isConsistentFast([fastAusculta, fastAusculta])).toBe(false);
  });

  it("doğruluk %90'ın altındaysa false", () => {
    expect(isConsistentFast([fastAusculta, { ...fastAusculta, correctRate: 89 }, fastAusculta])).toBe(false);
  });

  it("medyan gecikme 1.5 katı eşiği aşarsa false", () => {
    const bound = TOO_FAST_THRESHOLD_MS.ausculta * 1.5;
    expect(isConsistentFast([fastAusculta, { ...fastAusculta, medianLatencyMs: bound }, fastAusculta])).toBe(false);
  });

  it("medyan gecikme null ise (vaka hiç gerçekten yanıtlanmamış) false", () => {
    expect(isConsistentFast([fastAusculta, { ...fastAusculta, medianLatencyMs: null }, fastAusculta])).toBe(false);
  });
});

describe("integrityScore / shouldFlag", () => {
  it("iki ağır sinyal (too_fast x2) eşiği aşar; tek ağır sinyal aşmaz", () => {
    // 10 vakalık oturum: 2 hızlı-doğru dürüst öğrencide de olabilir (işaret yok); 3 işaretler.
    const session = (fast: number) => Array.from({ length: 10 }, (_, i) => (i < fast ? ["too_fast" as const] : []));
    const twoHeavy = integrityScore(session(2), false);
    const threeHeavy = integrityScore(session(3), false);
    expect(shouldFlag(twoHeavy)).toBe(false);
    expect(shouldFlag(threeHeavy)).toBe(true);
    expect(threeHeavy).toBeGreaterThanOrEqual(INTEGRITY_FLAG_SCORE_THRESHOLD);
  });

  it("tutarlılık sinyali tek başına eşiği aşar", () => {
    expect(shouldFlag(integrityScore([], true))).toBe(true);
    expect(integrityScore([], true)).toBe(SIGNAL_WEIGHTS.consistent_fast);
  });

  it("hiç sinyal yoksa skor sıfır ve işaretlenmez", () => {
    expect(integrityScore([[], []], false)).toBe(0);
    expect(shouldFlag(0)).toBe(false);
  });
});

describe("buildFlagSignals — KVKK: yalnız sayı ve sinyal adı", () => {
  it("yalnız vakası olan girişleri taşır ve sayımları doğru tutar", () => {
    const result = buildFlagSignals([["too_fast"], [], ["paste", "blur_many"]], true);
    expect(result.cases).toEqual({ "1": ["too_fast"], "3": ["paste", "blur_many"] });
    expect(result.counts).toEqual({
      too_fast: 1,
      no_interaction_correct: 0,
      tab_hidden: 0,
      blur_many: 1,
      paste: 1,
      consistent_fast: 1,
    });
  });

  it("serbest metin taşımaz: tüm değerler sayı ya da bilinen sinyal adı", () => {
    const KNOWN = new Set(["too_fast", "no_interaction_correct", "tab_hidden", "blur_many", "paste", "consistent_fast"]);
    const result = buildFlagSignals([["too_fast", "tab_hidden"]], false);
    for (const signals of Object.values(result.cases)) {
      for (const signal of signals) expect(KNOWN.has(signal), signal).toBe(true);
    }
    for (const [name, count] of Object.entries(result.counts)) {
      expect(KNOWN.has(name), name).toBe(true);
      expect(Number.isInteger(count)).toBe(true);
    }
  });
});

describe("median", () => {
  it("boş dizide null döner", () => {
    expect(median([])).toBeNull();
  });

  it("tek/çift eleman sayısında doğru medyanı verir", () => {
    expect(median([5])).toBe(5);
    expect(median([1, 3])).toBe(2);
    expect(median([7, 1, 3])).toBe(3);
  });
});
