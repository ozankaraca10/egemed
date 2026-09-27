/**
 * A1 ses vekili (ADR-009): vaka sesleri oturuma özel küçük bir varyasyonla
 * gönderilir; böylece bayt karşılaştırması (kütüphanedeki etiketli dosyalarla
 * özet/hash eşlemesi) sonuç vermez. Varyasyon klinik olarak anlamsızdır:
 * döngüsel başlangıç kaydırması (ses zaten döngüde çalar), ±%8 kazanç ve
 * ±1 LSB titreşim (dither). Yalnız 16 bit PCM WAV desteklenir; başka biçim
 * değiştirilmeden döner (güvenli taraf: sunum bozulmaz).
 */

export interface WavVariation {
  /** [0,1): başlangıç kaydırma oranı. */
  readonly offset: number;
  /** Kazanç çarpanı (ör. 0.92–1.08). */
  readonly gain: number;
  /** [0,1) rastgele kaynak (titreşim). */
  readonly random: () => number;
}

function readAscii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

/** RIFF parçalarını gezip `fmt ` ve `data` konumlarını bulur. */
function locate(bytes: Uint8Array): { readonly format: number; readonly bits: number; readonly channels: number; readonly dataAt: number; readonly dataLength: number } | null {
  if (bytes.length < 44 || readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WAVE") return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 12;
  let format = 0;
  let bits = 0;
  let channels = 0;
  while (at + 8 <= bytes.length) {
    const id = readAscii(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      format = view.getUint16(at + 8, true);
      channels = view.getUint16(at + 10, true);
      bits = view.getUint16(at + 22, true);
    } else if (id === "data") {
      return { format, bits, channels, dataAt: at + 8, dataLength: Math.min(size, bytes.length - at - 8) };
    }
    at += 8 + size + (size % 2);
  }
  return null;
}

export function varyWav(input: Uint8Array, variation: WavVariation): Uint8Array {
  const found = locate(input);
  if (found === null || found.format !== 1 || found.bits !== 16 || found.channels < 1) return input;
  const output = new Uint8Array(input);
  const frameBytes = 2 * found.channels;
  const frames = Math.floor(found.dataLength / frameBytes);
  if (frames < 2) return output;
  const source = new DataView(input.buffer, input.byteOffset + found.dataAt, frames * frameBytes);
  const target = new DataView(output.buffer, output.byteOffset + found.dataAt, frames * frameBytes);
  const shift = Math.floor(Math.max(0, Math.min(0.999, variation.offset)) * frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const from = ((frame + shift) % frames) * frameBytes;
    const to = frame * frameBytes;
    for (let channel = 0; channel < found.channels; channel += 1) {
      const sample = source.getInt16(from + channel * 2, true);
      const dither = Math.round(variation.random() * 2 - 1);
      const varied = Math.max(-32768, Math.min(32767, Math.round(sample * variation.gain) + dither));
      target.setInt16(to + channel * 2, varied, true);
    }
  }
  return output;
}
