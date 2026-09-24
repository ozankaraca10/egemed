import { describe, expect, it } from "vitest";
import { CardiacModel, MODES, pulseMetricSnapshot, systematicReadout } from "../../packages/sim-pulse/src/index";

describe("Pulse metrik ve açıklama modeli", () => {
  it("her mod için altı sistematik okuma adımı ve sözleşmeli çeviri anahtarları üretir", () => {
    for (const mode of MODES) {
      const findings = systematicReadout(mode);
      expect(findings).toHaveLength(6);
      for (const finding of findings) expect(finding.labelKey).toMatch(/^sim\.pulse\.systematic\./);
    }
  });

  it("AF hız profili ve ST ölçümünü verilen lead ile günceller", () => {
    expect(systematicReadout("af", { afProfile: "rapid" })[0]?.value).toBe("Yaklaşık 110–175/dk");
    expect(systematicReadout("stemi", { lead: "V4", stValue: 0.24 })[5]?.value).toBe("V4 derivasyonunda J noktası +0,24 mV");
    expect(systematicReadout("inferior", { lead: "III", stValue: -0.08 })[5]?.value).toBe("III J noktası -0,08 mV");
  });

  it("faz etiketini çeviri anahtarına, null ölçümleri boş değere dönüştürür", () => {
    const normal = pulseMetricSnapshot(new CardiacModel("normal"), 3.271, "V2");
    expect(normal.phaseKey).toBe("sim.pulse.phase.qrs");
    expect(normal.metrics.find((metric) => metric.id === "qrs")).toMatchObject({ value: "80", unit: "ms" });

    const vf = pulseMetricSnapshot(new CardiacModel("vf"), 3.271);
    expect(vf.phaseKey).toBe("sim.pulse.phase.chaotic");
    expect(vf.metrics.every((metric) => metric.value === null)).toBe(true);
  });
});
