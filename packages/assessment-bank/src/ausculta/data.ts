/**
 * Anahtarlı Ausculta verisi (A1, ADR-009). Vaka dosyaları (doğru yanıt, geri
 * bildirim, ipucu) YALNIZ bu pakettedir (T196); ses manifestleri öğrenme
 * kütüphanesi için sim paketinde kalır ve buradan okunur.
 */
import casesJson from "../../data/ausculta/cases.json" with { type: "json" };
import casesAutoJson from "../../data/ausculta/cases-auto.json" with { type: "json" };
import soundsJson from "../../../sim-ausculta/src/data/sounds.json" with { type: "json" };
import externalJson from "../../../sim-ausculta/src/data/sounds-external.json" with { type: "json" };
import type { CaseDef, SoundsManifest } from "./types";

export const soundsManifest = soundsJson as unknown as SoundsManifest;
export const externalManifest = externalJson as unknown as { records?: SoundsManifest["records"] };
export const ALL_CASES: readonly CaseDef[] = [
  ...((casesJson as unknown as { cases: CaseDef[] }).cases),
  ...((casesAutoJson as unknown as { cases: CaseDef[] }).cases),
];
