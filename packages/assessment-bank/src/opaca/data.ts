/**
 * Anahtarlı Opaca verisi (A2.1, ADR-009). Vaka dosyaları ŞİMDİLİK sim paketinden
 * okunur (A2.4'te bankaya taşınır). Görüntü bölgesi birleştirme kuralı istemciyle
 * aynı saf yardımcıyı kullanır; anahtarlı vaka kodu istemciye taşınmaz.
 */
import casesJson from "../../../sim-opaca/src/data/cases.json" with { type: "json" };
import casesAutoJson from "../../../sim-opaca/src/data/cases-auto.json" with { type: "json" };
import imagesJson from "../../../sim-opaca/src/data/images.json" with { type: "json" };
import imageZonesJson from "../../../sim-opaca/src/data/image-zones.json" with { type: "json" };
import { resolveZonesForImage, type ImageZonesData } from "../../../sim-opaca/src/data/imageZoneModel";
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

const imageZones = imageZonesJson as unknown as ImageZonesData;

export function zonesForImage(imageId: string): ReadingZone[] | null {
  return resolveZonesForImage(imageZones, imageId);
}

export function noZonesReasonForImage(imageId: string): string | null {
  return imageZones.noZones[imageId] ?? null;
}
