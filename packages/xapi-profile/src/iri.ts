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
 * Ortak `https://` değişmezi: şema https, yetki (authority) dolu, sorgu/
 * fragment/boşluk yok. Hata metinleri çağırana bırakılır. İç yardımcıdır;
 * paket API'sine (`index.ts`) dışa aktarılmaz (N3).
 */
export function assertHttpsIri(
  value: string,
  invalidSchemeMessage: string,
  invalidCharsMessage: string,
): void {
  const scheme = "https://";
  if (
    value.length <= scheme.length ||
    !value.startsWith(scheme) ||
    value.charAt(scheme.length) === "/"
  ) {
    throw new RangeError(`${invalidSchemeMessage}: ${JSON.stringify(value)}`);
  }
  if (/[\s?#]/.test(value)) {
    throw new RangeError(`${invalidCharsMessage}: ${JSON.stringify(value)}`);
  }
}

/**
 * base: https, yetki (authority) dolu, sonda "/" zorunlu; sorgu ve fragment
 * yasak. Kök TS lib seti DOM/Node içermediğinden `URL` yerine regex kullanılır.
 */
function assertBase(base: string): void {
  assertHttpsIri(base, "Geçersiz base IRI", "base sorgu veya fragment taşıyamaz");
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
