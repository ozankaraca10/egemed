import libraryData from "./library.json";
import sourcesData from "./sources.json";
import pointsData from "./auscultation-points.json";
import { CASE_INVENTORY } from "./inventory";
import { RECORDS, EXTERNAL_RECORDS } from "../core/resolver";

/** Envanter zenginliği metrikleri — landing sayfasında gösterilir (tamamen veri odaklı). */

export interface InventoryMetrics {
  datasets: number;
  datasetsVerified: number;
  datasetsPediatric: number;
  bundledRecordings: number;
  externalRecordings: number;
  soundClasses: number;
  auscultationPoints: number;
  totalCases: number;
  practicePoolSize: number;
  assessmentPoolSize: number;
  assessmentQuestions: number;
  pediatricCases: number;
  mixedCases: number;
}

export function computeMetrics(): InventoryMetrics {
  const inv =
    (
      sourcesData as unknown as {
        inventory: { population: string; title: string; notes: string; licenseVerified: boolean; status: string }[];
      }
    ).inventory ?? [];
  const libraryCount = libraryData.groups.reduce((s, g) => s + g.items.length, 0);
  const bundled = RECORDS.filter((r) => r.sourceDataset === "hls-cmds-v3").length;
  return {
    datasets: inv.length,
    datasetsVerified: inv.filter((x) => x.licenseVerified).length,
    datasetsPediatric: inv.filter((x) => /pediatrik|pediatric|çocuk|fetal/i.test(`${x.population} ${x.title} ${x.notes}`))
      .length,
    bundledRecordings: bundled,
    externalRecordings: EXTERNAL_RECORDS.length,
    soundClasses: libraryCount,
    auscultationPoints: (pointsData.points as unknown[]).length,
    totalCases: CASE_INVENTORY.totalCases,
    practicePoolSize: CASE_INVENTORY.practicePoolSize,
    assessmentPoolSize: CASE_INVENTORY.assessmentPoolSize,
    assessmentQuestions: CASE_INVENTORY.assessmentQuestions,
    pediatricCases: CASE_INVENTORY.pediatricCases,
    mixedCases: CASE_INVENTORY.mixedCases,
  };
}
