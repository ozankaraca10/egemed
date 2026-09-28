import { describe, expect, it } from "vitest";
import type { SoundAssignment } from "../../packages/sim-ausculta/src/core/types";
import * as simResolver from "../../packages/sim-ausculta/src/core/resolver";
import * as bankResolver from "../../packages/assessment-bank/src/ausculta/resolver";
import { ALL_CASES } from "./bank-cases";

/**
 * T230 — karma vakalarda posterior noktada akciğer bileşeni (depo sahibi onaylı tıbbi karar):
 * sırtta kalp sesleri zayıf duyulur; karma atama posterior noktada, o noktada gerçek karma
 * kayıt yoksa akciğer bileşeninin gerçek posterior kaydıyla (KAUH) çözülür. Böyle bir kayıt
 * yoksa mevcut anterior fallback aynen sürer. Çözümleyicinin iki kopyası aynı davranmalıdır.
 */

type ResolverCopy = typeof simResolver;

const COPIES: readonly { readonly name: string; readonly resolver: ResolverCopy }[] = [
  { name: "sim-ausculta", resolver: simResolver },
  // Banka kopyası yapısal olarak birebir aynı yüzeyi sunar (tip kimlikleri paket başına farklı).
  { name: "assessment-bank", resolver: bankResolver as unknown as ResolverCopy },
];

const MIXED_WHEEZING: SoundAssignment = {
  pointId: "lung_right_lower_posterior",
  category: "mixed",
  acousticFinding: "s3+wheezing",
};
const MIXED_RHONCHI: SoundAssignment = {
  pointId: "lung_right_lower_posterior",
  category: "mixed",
  acousticFinding: "atrial_fibrillation+rhonchi",
};
const MIXED_PLEURAL_RUB: SoundAssignment = {
  pointId: "lung_right_lower_posterior",
  category: "mixed",
  acousticFinding: "s3+pleural_rub",
};
const MIXED_ANTERIOR: SoundAssignment = {
  pointId: "lung_left_upper_anterior",
  category: "mixed",
  acousticFinding: "mid_systolic_murmur+wheezing",
};

for (const { name, resolver } of COPIES) {
  describe(`karma posterior çözümleme — ${name} (T230)`, () => {
    it("KAUH akciğer bileşeni olan noktada bileşen kaydına çözülür (fallback yok)", () => {
      const res = resolver.resolveAssignmentEx(MIXED_WHEEZING);
      expect(res.record).not.toBeNull();
      expect(res.record!.sourceDataset).toBe("kauh-v3");
      expect(res.record!.acousticFinding).toBe("wheezing");
      expect(res.record!.simulationLocation).toBe("lung_right_lower_posterior");
      expect(res.fallbackFrom).toBeUndefined();
      expect(res.lungComponentOf).toBe("mixed");
    });

    it("KAUH bileşen kaydı yoksa anterior fallback aynen sürer (rhonchi/pleural_rub)", () => {
      const rhonchi = resolver.resolveAssignmentEx(MIXED_RHONCHI);
      expect(rhonchi.record).not.toBeNull();
      expect(rhonchi.record!.sourceDataset).toBe("hls-cmds-v3");
      expect(rhonchi.record!.simulationLocation).toBe("lung_right_lower_anterior");
      expect(rhonchi.fallbackFrom).toBe("lung_right_lower_anterior");
      expect(rhonchi.lungComponentOf).toBeUndefined();

      const rub = resolver.resolveAssignmentEx(MIXED_PLEURAL_RUB);
      expect(rub.record).not.toBeNull();
      expect(rub.record!.simulationLocation).toBe("lung_right_lower_anterior");
      expect(rub.fallbackFrom).toBe("lung_right_lower_anterior");
      expect(rub.lungComponentOf).toBeUndefined();
    });

    it("anterior karma atamalar değişmez", () => {
      const res = resolver.resolveAssignmentEx(MIXED_ANTERIOR);
      expect(res.record).not.toBeNull();
      expect(res.record!.simulationLocation).toBe("lung_left_upper_anterior");
      expect(res.fallbackFrom).toBeUndefined();
      expect(res.lungComponentOf).toBeUndefined();
    });

    it("vaka ses haritası bileşen/fallback bilgisini ayrı taşır", () => {
      const component = resolver.resolveCaseSoundsEx([MIXED_WHEEZING]);
      expect(component.components).toEqual({ lung_right_lower_posterior: "lung" });
      expect(component.fallbacks).toEqual({});
      expect(component.sounds.lung_right_lower_posterior?.sourceDataset).toBe("kauh-v3");

      const fallback = resolver.resolveCaseSoundsEx([MIXED_RHONCHI]);
      expect(fallback.components).toEqual({});
      expect(fallback.fallbacks).toEqual({ lung_right_lower_posterior: "lung_right_lower_anterior" });
    });

    it("O7: bileşenle çözülen posterior nokta değerlendirmede sunulur, fallback dışlanır", () => {
      expect(resolver.assessmentPointFilter([MIXED_WHEEZING])).toEqual(["lung_right_lower_posterior"]);
      expect(resolver.assessmentPointFilter([MIXED_RHONCHI])).toEqual([]);
    });

    it("kitaplık karma bulgusu posterior noktada KAUH bileşen kaydını çalar", () => {
      const component = resolver.resolveLibrarySoundEx("mixed", "s3+normal", "lung_right_lower_posterior");
      expect(component.record?.sourceDataset).toBe("kauh-v3");
      expect(component.record?.simulationLocation).toBe("lung_right_lower_posterior");
      expect(component.lungComponentOf).toBe("mixed");
      expect(component.fallbackFrom).toBeUndefined();

      const fallback = resolver.resolveLibrarySoundEx("mixed", "atrial_fibrillation+rhonchi", "lung_right_lower_posterior");
      expect(fallback.record?.simulationLocation).toBe("lung_right_lower_anterior");
      expect(fallback.fallbackFrom).toBe("lung_right_lower_anterior");
      expect(fallback.lungComponentOf).toBeUndefined();

      const anterior = resolver.resolveLibrarySoundEx("mixed", "s3+normal", "lung_right_lower_anterior");
      expect(anterior.record?.simulationLocation).toBe("lung_right_lower_anterior");
      expect(anterior.fallbackFrom).toBeUndefined();
      expect(anterior.lungComponentOf).toBeUndefined();
    });
  });
}

describe("banka kapsamı (T230/T234)", () => {
  it("200 vaka: 159 tam, 41 fallback'li, 0 kayıtsız", () => {
    let full = 0;
    let fallback = 0;
    let unresolved = 0;
    for (const c of ALL_CASES) {
      let hasFallback = false;
      let hasUnresolved = false;
      for (const a of c.soundAssignments) {
        const res = bankResolver.resolveAssignmentEx(a);
        if (res.fallbackFrom) hasFallback = true;
        if (res.record === null) hasUnresolved = true;
      }
      if (hasUnresolved) unresolved += 1;
      else if (hasFallback) fallback += 1;
      else full += 1;
    }
    expect({ total: ALL_CASES.length, full, fallback, unresolved }).toEqual({
      total: 200,
      full: 159,
      fallback: 41,
      unresolved: 0,
    });
  });

  it("gerçek vakalarda bileşen/fallback ayrımı dengeli (O7)", () => {
    const componentCase = ALL_CASES.find((c) => c.id === "case_mixed_s3_normal");
    expect(componentCase).toBeDefined();
    const componentPoints = bankResolver.assessmentPointFilter(componentCase!.soundAssignments);
    expect(componentPoints).toContain("lung_right_lower_posterior");
    expect(componentPoints).toHaveLength(componentCase!.soundAssignments.length);

    const fallbackCase = ALL_CASES.find((c) => c.id === "case_mixed_af_rhonchi");
    expect(fallbackCase).toBeDefined();
    const fallbackPoints = bankResolver.assessmentPointFilter(fallbackCase!.soundAssignments);
    expect(fallbackPoints).not.toContain("lung_right_lower_posterior");

    const { components } = bankResolver.resolveCaseSoundsEx(componentCase!.soundAssignments);
    expect(components).toEqual({ lung_right_lower_posterior: "lung" });
  });
});

describe("karma posterior bileşen işareti yalnız uygulamada (cevap sızıntısı yok)", () => {
  it("değerlendirme/düello public case'inde component alanı yok", async () => {
    const { ausculta } = await import("../../packages/assessment-bank/src/index");
    const caseDef = ALL_CASES.find((c) => c.id === "case_mixed_s3_normal");
    expect(caseDef, "case_mixed_s3_normal bankada olmalı").toBeDefined();
    const build = (mode: "practice" | "assessment" | "challenge") => {
      let n = 0;
      return ausculta.buildPublicCase(caseDef as never, {
        index: 1,
        mode,
        openedAt: "2026-09-28T10:00:00.000+03:00",
        newToken: () => `tok_t${String((n += 1)).padStart(6, "0")}`,
        random: () => 0.5,
      }).publicCase;
    };
    const flagged = (pc: { readonly points: readonly object[] }) => pc.points.filter((p) => "component" in p).length;
    expect(flagged(build("practice"))).toBeGreaterThan(0);
    expect(flagged(build("assessment"))).toBe(0);
    expect(flagged(build("challenge"))).toBe(0);
  });
});
