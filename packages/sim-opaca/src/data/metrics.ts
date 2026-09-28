import sourcesData from "./sources.json";
import { CASE_INVENTORY } from "./inventory";
import { IMAGES } from "../core/images";
import { LIBRARY_ITEMS } from "./terminology";
import { ZONES } from "./zones";
import { EXPERT_SOURCES } from "../core/types";

/** Envanter metrikleri — başlangıç ekranında gösterilir (tamamen veri odaklı). */
export interface InventoryMetrics {
  datasetsUsed: number;
  images: number;
  expertImages: number;
  annotatedImages: number;
  libraryItems: number;
  zones: number;
  totalCases: number;
  practicePoolSize: number;
  assessmentPoolSize: number;
  assessmentQuestions: number;
}

export function computeMetrics(): InventoryMetrics {
  const used = new Set(IMAGES.map((r) => r.sourceDataset));
  const ds = (sourcesData.datasets as { id: string }[]).filter((d) => used.has(d.id));
  return {
    datasetsUsed: ds.length,
    images: IMAGES.length,
    expertImages: IMAGES.filter((r) => Object.values(r.findings).some((s) => (EXPERT_SOURCES as readonly string[]).includes(s))).length,
    annotatedImages: IMAGES.filter((r) => r.annotations.length > 0).length,
    libraryItems: LIBRARY_ITEMS.length,
    zones: ZONES.length,
    totalCases: CASE_INVENTORY.totalCases,
    practicePoolSize: CASE_INVENTORY.practicePoolSize,
    assessmentPoolSize: CASE_INVENTORY.assessmentPoolSize,
    assessmentQuestions: CASE_INVENTORY.assessmentQuestions,
  };
}
