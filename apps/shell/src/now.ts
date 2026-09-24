/**
 * Kabuktaki tek saat sağlayıcı (AGENTS.md): zaman doğrudan okunmaz, `now`
 * bağımlılık olarak enjekte edilir ve `Date.now()` lint kuralıyla yasaktır.
 * Bu yüzden duvar saati `performance.timeOrigin + performance.now()` ile
 * üretilir: sayfa açılışında sabitlenen `timeOrigin` ile monoton artan
 * `performance.now()` toplamı, epoch benzeri milisaniye verir ve sistem saati
 * geriye alınsa bile sim oturumları içinde tek yönlü ilerler.
 */

/** Kök tsconfig DOM lib'i taşımadığı için `performance` en dar arayüzle okunur. */
interface PerformanceClock {
  readonly timeOrigin: number;
  now(): number;
}

/** DOM'suz ortamda (SSR/test) performans saati yoksa kullanılan sabit başlangıç. */
const NO_CLOCK_ORIGIN = 0;

/** Sim modüllerine `SimMountContext.now` olarak geçirilen tek saat sağlayıcı. */
export function shellNow(): number {
  const perf = (globalThis as { performance?: PerformanceClock }).performance;
  return perf === undefined ? NO_CLOCK_ORIGIN : perf.timeOrigin + perf.now();
}
