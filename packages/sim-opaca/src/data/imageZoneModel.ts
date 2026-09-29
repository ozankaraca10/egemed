import type { AbcdeStep, Box, ReadingZone } from "../core/types";

export type ImageZoneSet = "frontal" | "lateral";

interface ZoneDefinition {
  readonly step: AbcdeStep;
  readonly label: string;
  readonly fullLabel: string;
  readonly detail?: string;
}

export interface ImageZonesData {
  readonly zoneDefs: Readonly<Record<ImageZoneSet, Readonly<Record<string, ZoneDefinition>>>>;
  readonly images: Readonly<Record<string, {
    readonly set: ImageZoneSet;
    readonly zones: Readonly<Record<string, readonly Box[]>>;
  }>>;
  readonly noZones: Readonly<Record<string, string>>;
}

/** Görüntüye özgü dikdörtgenleri ait oldukları ABCDE tanımlarıyla birleştirir. */
export function resolveZonesForImage(data: ImageZonesData, imageId: string): ReadingZone[] | null {
  const image = data.images[imageId];
  if (!image) return null;
  const definitions = data.zoneDefs[image.set];
  return Object.entries(definitions).flatMap(([id, definition]) => {
    const rects = image.zones[id];
    if (!rects) return [];
    return [{ id, ...definition, detail: definition.detail ?? definition.fullLabel, rects: rects.map((rect) => ({ ...rect })) }];
  });
}
