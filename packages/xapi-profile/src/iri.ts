import type { ActivityIri, SimulatorId } from "./profile";

/** Etkinlik yolu; `object` yalnız `screen` varken geçerlidir. */
export interface ActivityPath {
  readonly simulator: SimulatorId;
  readonly screen?: string;
  readonly object?: string;
}

/** Segment kuralı: küçük harf/rakamla başlar, en çok 63 karakter. */
const SEGMENT = /^[a-z0-9][a-z0-9-]{0,62}$/;

function assertSegment(value: string, label: string): void {
  if (!SEGMENT.test(value)) {
    throw new RangeError(`Geçersiz ${label} segmenti: ${JSON.stringify(value)}`);
  }
}

/**
 * base: https, yetki (authority) dolu, sonda "/" zorunlu; sorgu ve fragment
 * yasak. Kök TS lib seti DOM/Node içermediğinden `URL` yerine regex kullanılır.
 */
function assertBase(base: string): void {
  const scheme = "https://";
  if (
    base.length <= scheme.length ||
    !base.startsWith(scheme) ||
    base.charAt(scheme.length) === "/"
  ) {
    throw new RangeError(`Geçersiz base IRI: ${JSON.stringify(base)}`);
  }
  if (/[\s?#]/.test(base)) {
    throw new RangeError(`base sorgu veya fragment taşıyamaz: ${JSON.stringify(base)}`);
  }
  if (!base.endsWith("/")) {
    throw new RangeError(`base "/" ile bitmeli: ${JSON.stringify(base)}`);
  }
}

/**
 * `base` + `simulator` + isteğe bağlı `screen`/`object` birleşiminden
 * deterministik activity IRI'si üretir. Geçersiz girdide RangeError atar.
 */
export function activityIri(base: string, path: ActivityPath): ActivityIri {
  assertBase(base);
  assertSegment(path.simulator, "simulator");
  const segments: string[] = [path.simulator];
  if (path.screen !== undefined) {
    assertSegment(path.screen, "screen");
    segments.push(path.screen);
  }
  if (path.object !== undefined) {
    if (path.screen === undefined) {
      throw new RangeError("object segmenti yalnız screen ile birlikte kullanılabilir.");
    }
    assertSegment(path.object, "object");
    segments.push(path.object);
  }
  return `${base}${segments.join("/")}` as ActivityIri;
}
