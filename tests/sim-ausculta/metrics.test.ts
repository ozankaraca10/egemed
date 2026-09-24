import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RECORDS, computeMetrics } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:760-828 (9 test → 9 test). */

const sources = JSON.parse(readFileSync("packages/sim-ausculta/src/data/sources.json", "utf8")) as {
  datasets: { id: string; title: string; license: string; authors: string[]; attributionText: string }[];
  inventory: {
    id: string;
    title: string;
    authors: string[];
    license: string;
    licenseUrl: string;
    licenseVerified: boolean;
    status: string;
    accessUrl: string;
    notes: string;
    population: string;
    recordings: number;
    attributionText: string;
    importScript: string | null;
    labelTypes?: string[];
  }[];
};

describe("landing metrikleri", () => {
  it("envanter zenginliği metrikleri hesaplanır ve tutarlıdır", () => {
    const m = computeMetrics();
    expect(m.datasets).toBeGreaterThanOrEqual(2);
    expect(m.datasetsPediatric).toBeGreaterThanOrEqual(1);
    expect(m.soundClasses).toBeGreaterThanOrEqual(16);
    expect(m.auscultationPoints).toBeGreaterThanOrEqual(17);
    expect(m.practicePoolSize).toBeGreaterThanOrEqual(100);
    expect(m.assessmentPoolSize).toBeGreaterThanOrEqual(60);
    expect(m.assessmentQuestions).toBeGreaterThanOrEqual(150);
    expect(m.pediatricCases).toBeGreaterThanOrEqual(7);
    expect(m.bundledRecordings).toBeGreaterThanOrEqual(200);
  });
});

describe("veri seti envanteri", () => {
  it("envanter yalnızca kullanılan veri setlerini içerir (HLS-CMDS + CirCor)", () => {
    const ids = sources.inventory.map((x) => x.id).sort();
    expect(ids).toEqual(["hls-cmds-v3", "physionet-circor"]);
  });
  it("kullanılan tüm veri setlerinin lisansı doğrulanmıştır", () => {
    const unverified = sources.inventory.filter((x) => !x.licenseVerified);
    expect(unverified).toEqual([]);
  });
  it("her envanter kaydında etiket kalitesi bilgisi vardır", () => {
    for (const row of sources.inventory) {
      expect(Array.isArray(row.labelTypes) && row.labelTypes.length > 0, `etiket: ${row.id}`).toBe(true);
    }
  });
  it("pediatrik veri seti (CirCor) envanterdedir", () => {
    const ped = sources.inventory.filter((x) => /pediatrik|pediatric|çocuk|fetal/i.test(`${x.population} ${x.title} ${x.notes}`));
    expect(ped.length).toBeGreaterThanOrEqual(1);
  });
  it("her envanter kaydı lisans, atıf ve erişim bağlantısı içerir", () => {
    for (const row of sources.inventory) {
      expect(row.license.length, `lisans: ${row.id}`).toBeGreaterThan(3);
      expect(row.licenseUrl.length, `lisans bağlantısı: ${row.id}`).toBeGreaterThan(8);
      expect(row.attributionText.length, `atıf: ${row.id}`).toBeGreaterThan(10);
      expect(row.accessUrl.startsWith("http"), `erişim: ${row.id}`).toBe(true);
      if (row.recordings != null) expect(row.recordings).toBeGreaterThan(0);
    }
  });
  it("pakete dahil veri setleri doğrulanmış lisansa sahiptir", () => {
    for (const row of sources.inventory.filter((x) => ["bundled", "samples_included", "importer_ready"].includes(x.status))) {
      expect(row.licenseVerified, `${row.id} lisansı doğrulanmış olmalı`).toBe(true);
    }
  });
  it("ICBHI 2017 paket içeriğinde bulunmaz (§34)", () => {
    expect(RECORDS.some((r) => r.sourceDataset === "icbhi-2017")).toBe(false);
  });
  it("paketlenen seslerin kaynak atıfları tanımlıdır (datasets ↔ inventory)", () => {
    const bundled = RECORDS.find((r) => r.sourceDataset === "hls-cmds-v3");
    expect(bundled).toBeDefined();
    expect(sources.inventory.some((row) => row.id === "hls-cmds-v3" && row.status === "bundled")).toBe(true);
    expect(sources.datasets.some((d) => d.id === "hls-cmds-v3" && d.license.includes("CC BY 4.0"))).toBe(true);
  });
});
