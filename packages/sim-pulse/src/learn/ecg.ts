/**
 * T298 — gerçek 12 derivasyon EKG kaydı: çözme, R tepesi saptama, RR ölçümü.
 *
 * Biçim `data/realEcg.json` `format` alanıyla sabittir: int16 little-endian,
 * µV, 250 Hz, 2500 örnek (10 s), 12 derivasyon, derivasyon-ardışık
 * (lead-major). Saptama yalnız kaydın kendisinden türer; EKG'de olmayan veri
 * (nabız, tansiyon) üretilmez.
 */

export const PULSE_ECG_FS = 250;
const PULSE_ECG_SAMPLES = 2500;
export const PULSE_ECG_LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;

export interface PulseEcgRecord {
  /** Derivasyon başına mV dizisi. */
  readonly leads: readonly Float32Array[];
  /** R tepesi zamanları (s). */
  readonly r: readonly number[];
}

export interface PulseRhythmStats {
  /** Ortanca RR (s); atım yoksa null. */
  readonly rrMedian: number | null;
  /** Ortanca RR'den hız (/dk). */
  readonly rate: number | null;
  /** RR değişkenlik katsayısı. */
  readonly cv: number | null;
  readonly regular: boolean | null;
}

/** `.bin` içeriğini derivasyon başına mV dizilerine çözer. */
export function decodePulseEcg(buffer: ArrayBuffer): Float32Array[] {
  const expected = PULSE_ECG_LEADS.length * PULSE_ECG_SAMPLES;
  if (buffer.byteLength !== expected * 2) throw new Error(`Pulse EKG: beklenmeyen kayıt boyu (${buffer.byteLength} bayt).`);
  const view = new DataView(buffer);
  const leads: Float32Array[] = [];
  for (let lead = 0; lead < PULSE_ECG_LEADS.length; lead += 1) {
    const out = new Float32Array(PULSE_ECG_SAMPLES);
    const base = lead * PULSE_ECG_SAMPLES * 2;
    for (let i = 0; i < PULSE_ECG_SAMPLES; i += 1) out[i] = view.getInt16(base + i * 2, true) / 1000;
    leads.push(out);
  }
  return leads;
}

function percentile(values: Float32Array, p: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

/**
 * QRS saptama: tüm derivasyonların mutlak eğimi toplanır, 100 ms pencerede
 * yumuşatılır; eşiği aşan yerel tepeler 200 ms dirençli dönemle seçilir.
 * Çok derivasyonlu enerji tek derivasyondaki düşük genliğe karşı dayanıklıdır.
 */
function detectPulseRPeaks(leads: readonly Float32Array[], fs = PULSE_ECG_FS): number[] {
  const n = leads[0]?.length ?? 0;
  if (n < 3) return [];
  const slope = new Float32Array(n);
  for (const lead of leads) {
    for (let i = 1; i < n - 1; i += 1) slope[i] = (slope[i] ?? 0) + Math.abs((lead[i + 1] ?? 0) - (lead[i - 1] ?? 0));
  }
  const win = Math.max(1, Math.round(0.1 * fs));
  const energy = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i += 1) {
    acc += slope[i] ?? 0;
    if (i >= win) acc -= slope[i - win] ?? 0;
    energy[i] = acc / win;
  }
  const threshold = 0.32 * percentile(energy, 0.99);
  if (threshold <= 0) return [];
  const refractory = Math.round(0.2 * fs);
  const peaks: number[] = [];
  let i = 1;
  while (i < n - 1) {
    if ((energy[i] ?? 0) < threshold) {
      i += 1;
      continue;
    }
    // Eşik üstü bölgenin en yüksek noktası
    let best = i;
    while (i < n - 1 && (energy[i] ?? 0) >= threshold) {
      if ((energy[i] ?? 0) > (energy[best] ?? 0)) best = i;
      i += 1;
    }
    // Yumuşatma gecikmesini (pencere/2) geri al ve eğimin en yüksek olduğu örneğe otur
    const center = Math.max(0, best - Math.floor(win / 2));
    let peak = center;
    for (let k = Math.max(0, center - win); k < Math.min(n, center + win); k += 1) if ((slope[k] ?? 0) > (slope[peak] ?? 0)) peak = k;
    // Kayıt başı/sonundaki filtre geçişleri QRS sayılmaz
    if (peak < win || peak > n - 1 - win) continue;
    const last = peaks[peaks.length - 1];
    if (last === undefined || peak - last >= refractory) peaks.push(peak);
    else if ((slope[peak] ?? 0) > (slope[last] ?? 0)) peaks[peaks.length - 1] = peak;
  }
  return peaks.map((p) => p / fs);
}

function rrIntervals(r: readonly number[]): number[] {
  return r.slice(1).map((v, i) => v - (r[i] ?? v));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

export function pulseRhythmStats(r: readonly number[]): PulseRhythmStats {
  const rr = rrIntervals(r);
  const med = median(rr);
  if (med === null || med <= 0) return { rrMedian: null, rate: null, cv: null, regular: null };
  const mean = rr.reduce((a, b) => a + b, 0) / rr.length;
  const sd = Math.sqrt(rr.reduce((s, v) => s + (v - mean) ** 2, 0) / rr.length);
  const cv = sd / mean;
  return { rrMedian: med, rate: Math.round(60 / med), cv, regular: cv <= 0.12 };
}

export function pulseEcgRecord(buffer: ArrayBuffer): PulseEcgRecord {
  const leads = decodePulseEcg(buffer);
  return { leads, r: detectPulseRPeaks(leads) };
}
