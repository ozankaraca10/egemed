/**
 * Anahtarlı Ausculta verisi (A1, ADR-009). Geçiş: A1.4'e dek JSON dosyaları sim
 * paketinde durur ve buradan okunur; A1.4 dosyaları bu pakete taşır ve sim
 * paketi yalnız öğrenme kütüphanesi alt kümesini tutar.
 */
import casesJson from "../../../sim-ausculta/src/data/cases.json" with { type: "json" };
import casesAutoJson from "../../../sim-ausculta/src/data/cases-auto.json" with { type: "json" };
import soundsJson from "../../../sim-ausculta/src/data/sounds.json" with { type: "json" };
import externalJson from "../../../sim-ausculta/src/data/sounds-external.json" with { type: "json" };
import type { CaseDef, SoundsManifest } from "./types";

export const soundsManifest = soundsJson as unknown as SoundsManifest;
export const externalManifest = externalJson as unknown as { records?: SoundsManifest["records"] };
export const ALL_CASES: readonly CaseDef[] = [
  ...((casesJson as unknown as { cases: CaseDef[] }).cases),
  ...((casesAutoJson as unknown as { cases: CaseDef[] }).cases),
];
