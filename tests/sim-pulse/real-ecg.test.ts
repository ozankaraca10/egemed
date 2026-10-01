import ts from "typescript";
import { describe, expect, it } from "vitest";
import manifest from "../../packages/sim-pulse/src/data/realEcg.json";

// T297: Evrim Hoca'nın seçtiği gerçek hasta EKG referansları (1 Eki 2026). Manifest ile
// ikili dosyalar tutarlı olmalı: her referans 12 derivasyon × 2500 örnek int16 (250 Hz, 10 s).
describe("Pulse gerçek EKG referans manifesti", () => {
  const bytes = manifest.format.leads.length * manifest.format.samples * 2;

  it("her referans dosyası var ve boyutu biçimle uyumlu; kimlikler tekil", () => {
    const ids = manifest.patterns.flatMap((pattern) => pattern.refs.map((ref) => ref.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const pattern of manifest.patterns) {
      for (const ref of pattern.refs) {
        expect(ts.sys.getFileSize?.(`packages/sim-pulse/public/${ref.file}`), ref.id).toBe(bytes);
        expect(Object.keys(manifest.sources)).toContain(ref.source);
      }
      expect(pattern.status, pattern.key).toBe(pattern.refs.length > 0 ? "ready" : "awaiting");
    }
  });

  it("acil rozetleri hocanın kararıyla aynıdır (değiştirilen önerilerle birlikte)", () => {
    const urgent = manifest.patterns.filter((pattern) => pattern.urgent).map((pattern) => pattern.key).sort();
    expect(urgent).toEqual(
      ["af", "chb", "flutter", "mi_anterior", "mi_avr", "mi_inferior", "mi_lateral", "mi_nstemi", "mi_posterior", "mi_wellens", "mobitz1", "mobitz2", "pat", "svt", "vf", "vt"].sort(),
    );
  });
});
