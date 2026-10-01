import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "../../packages/sim-pulse/src/data/realEcg.json";
import { learnRefsFor, learnTextFor, PULSE_VENDOR_MODE } from "../../packages/sim-pulse/src/learn/content";
import { PULSE_LEARN_SECONDS } from "../../packages/sim-pulse/src/learn/workspace";
import { decodePulseEcg, pulseEcgRecord, pulseRhythmStats } from "../../packages/sim-pulse/src/learn/ecg";

// T298: öğrenme modu gerçek 12 derivasyon kaydı gösterir; hız, RR ve kalp
// animasyonu kaydın kendisinden saptanan R tepelerinden türer.

function load(file: string): ArrayBuffer {
  return Uint8Array.from(readFileSync(`packages/sim-pulse/public/${file}`)).buffer;
}

describe("Pulse öğrenme modu EKG çözümleme", () => {
  it("int16le µV derivasyon-ardışık kaydı derivasyon başına mV'a çözer", () => {
    const buffer = new ArrayBuffer(12 * 2500 * 2);
    const view = new DataView(buffer);
    // Derivasyon 1 (DII), örnek 7 = 1250 µV; derivasyon 11 (V6), son örnek = -300 µV
    view.setInt16((1 * 2500 + 7) * 2, 1250, true);
    view.setInt16((11 * 2500 + 2499) * 2, -300, true);
    const leads = decodePulseEcg(buffer);
    expect(leads).toHaveLength(12);
    expect(leads[1]?.[7]).toBeCloseTo(1.25);
    expect(leads[11]?.[2499]).toBeCloseTo(-0.3);
    expect(leads[0]?.[7]).toBe(0);
    expect(() => decodePulseEcg(new ArrayBuffer(100))).toThrow();
  });

  it("öğretim üyesinin seçtiği kayıtlarda saptanan hız paternin rehber ölçütüne uyar", () => {
    // Ölçütler: AHA/ACCF/HRS (sinüs hızı sınırları, AF düzensizliği, VT/SVT hızı).
    const rules: Record<string, (s: ReturnType<typeof pulseRhythmStats>) => boolean> = {
      normal: (s) => s.rate !== null && s.rate >= 60 && s.rate <= 100 && s.regular === true,
      sintach: (s) => s.rate !== null && s.rate > 100,
      sinbrady: (s) => s.rate !== null && s.rate < 60,
      af: (s) => s.regular === false,
      svt: (s) => s.rate !== null && s.rate >= 150,
      vt: (s) => s.rate !== null && s.rate > 100,
      chb: (s) => s.rate !== null && s.rate < 60,
    };
    for (const pattern of manifest.patterns) {
      for (const ref of pattern.refs) {
        const record = pulseEcgRecord(load(ref.file));
        const stats = pulseRhythmStats(record.r);
        if (pattern.key === "vf") continue;
        expect(record.r.length, `${pattern.key} ${ref.id} atım sayısı`).toBeGreaterThanOrEqual(3);
        expect(stats.rate, `${pattern.key} ${ref.id} hız`).toBeGreaterThanOrEqual(20);
        expect(stats.rate, `${pattern.key} ${ref.id} hız`).toBeLessThanOrEqual(260);
        const rule = rules[pattern.key];
        if (rule !== undefined) expect(rule(stats), `${pattern.key} ${ref.id}: ${stats.rate}/dk, cv ${stats.cv?.toFixed(2)}`).toBe(true);
      }
    }
  });

  it("her kaydın işlenmemiş orijinal görüntüsü pakette (Orijinal Görüntü düğmesi)", () => {
    for (const pattern of manifest.patterns) {
      for (const ref of pattern.refs) {
        const png = readFileSync(`packages/sim-pulse/public/assets/ecg-orig/${ref.id}.png`);
        expect(png.subarray(1, 4).toString(), ref.id).toBe("PNG");
      }
    }
  });

  it("her hazır paternin öğrenci metni var; öğrenme kilidinin 23 kaynak modu eksiksiz eşlenir", () => {
    for (const pattern of manifest.patterns) {
      const text = learnTextFor(pattern.key);
      expect(text?.crit.length, pattern.key).toBeGreaterThan(20);
      expect(text?.look.length, pattern.key).toBeGreaterThan(0);
      expect(text?.mech.length, pattern.key).toBeGreaterThan(20);
      // Her ölçütün en az bir DOI'li kılavuz kaynağı var
      const refs = learnRefsFor(pattern.key);
      expect(refs.length, `${pattern.key} kaynak`).toBeGreaterThan(0);
      for (const ref of refs) expect(ref.doi, pattern.key).toMatch(/^10\.\d{4,}\//);
    }
    // Kaynak runtime ALL_MODES (model.js): kilit bu 23 modun her birinin ≥60 s incelenmesini ister.
    const model = readFileSync("packages/sim-pulse/src/runtime/vendor/model.js", "utf8");
    const vendorModes = [...model.matchAll(/MODES=\[([^\]]*)\]/g)].flatMap((m) => [...(m[1] ?? "").matchAll(/'([a-z0-9]+)'/g)].map((x) => x[1]));
    expect(new Set(vendorModes).size).toBe(23);
    // T302: kilit süresi kaynakta ve öğrenme alanında aynı (60 s)
    const stateSource = readFileSync("packages/sim-pulse/src/runtime/vendor/state.js", "utf8");
    expect(Number(/LEARN_S=(\d+)/.exec(stateSource)?.[1])).toBe(PULSE_LEARN_SECONDS);
    expect(PULSE_LEARN_SECONDS).toBe(60);
    const mapped = Object.values(PULSE_VENDOR_MODE);
    expect(new Set(mapped).size).toBe(mapped.length);
    expect([...mapped].sort()).toEqual([...new Set(vendorModes)].sort());
    const ready = new Set(manifest.patterns.filter((p) => p.status === "ready").map((p) => p.key));
    for (const key of Object.keys(PULSE_VENDOR_MODE)) expect(ready.has(key), `${key} kaydı hazır`).toBe(true);
  });
});
