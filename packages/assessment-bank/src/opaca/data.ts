/**
 * Anahtarlı Opaca verisi (A2.1, ADR-009). Vaka dosyaları ŞİMDİLİK sim paketinden
 * okunur (A2.4'te bankaya taşınır); banka sim paketine kod bağımlılığı almaz,
 * yalnız JSON okur.
 */
import casesJson from "../../../sim-opaca/src/data/cases.json" with { type: "json" };
import casesAutoJson from "../../../sim-opaca/src/data/cases-auto.json" with { type: "json" };
import imagesJson from "../../../sim-opaca/src/data/images.json" with { type: "json" };
import zonesJson from "../../../sim-opaca/src/data/reading-zones.json" with { type: "json" };
import type { CaseDef, ImageRecord, ImagesManifest, ReadingZone } from "./types";

export const ALL_CASES: readonly CaseDef[] = [
  ...((casesJson as unknown as { cases: CaseDef[] }).cases),
  ...((casesAutoJson as unknown as { cases: CaseDef[] }).cases),
];

const manifest = imagesJson as unknown as ImagesManifest;
export const IMAGES: readonly ImageRecord[] = manifest.records ?? [];
const byId = new Map(IMAGES.map((record) => [record.id, record]));

export function imageById(id: string | null | undefined): ImageRecord | undefined {
  return id ? byId.get(id) : undefined;
}

export const ZONES: readonly ReadingZone[] = (zonesJson as unknown as { zones: ReadingZone[] }).zones ?? [];
