import zonesData from "./reading-zones.json";
import imageZonesData from "./image-zones.json";
import type { ReadingZone } from "../core/types";
import { resolveZonesForImage, type ImageZonesData, type ImageZoneSet } from "./imageZoneModel";

export const STEP_TITLES = zonesData.steps as Record<string, string>;
const imageZones = imageZonesData as ImageZonesData;
const definitions = [...Object.entries(imageZones.zoneDefs.frontal), ...Object.entries(imageZones.zoneDefs.lateral)];

/** Koordinatsız bölge kataloğu. Görüntü çizimi ve puanlama için `zonesForImage` kullanılır. */
export const ZONES: ReadingZone[] = [...new Map(definitions.map(([id, definition]) => [id, {
  id,
  ...definition,
  detail: definition.detail ?? definition.fullLabel,
  rects: [],
}])).values()];

export const ZONE_IDS = ZONES.map((z) => z.id);
export function zoneById(id: string): ReadingZone | undefined {
  return ZONES.find((z) => z.id === id);
}

export function zonesForImage(imageId: string): ReadingZone[] | null {
  return resolveZonesForImage(imageZones, imageId);
}

export function zoneSetForImage(imageId: string): ImageZoneSet | null {
  return imageZones.images[imageId]?.set ?? null;
}

export function noZonesReasonForImage(imageId: string): string | null {
  return imageZones.noZones[imageId] ?? null;
}
