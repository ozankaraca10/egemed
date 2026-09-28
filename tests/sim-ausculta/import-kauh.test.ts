import { describe, expect, it } from "vitest";
import {
  decodePcm16Wav,
  encodePcm16Wav,
  mapKauhEntry,
  normalizePcm16,
  parseKauhFileName,
  truncatePcm16,
} from "../../packages/sim-ausculta/tools/import-kauh.mjs";

/** T227 — KAUH aktarım aracının saf yardımcıları; sentetik tampon, dosya sistemi yok. */

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) out += String.fromCharCode(bytes[offset + index] ?? 0);
  return out;
}

describe("KAUH WAV başlık yazıcısı/okuyucusu (PCM16)", () => {
  it("44 baytlık kanonik mono başlık yazar", () => {
    const bytes = encodePcm16Wav(Int16Array.from([0, 1000, -1000, 32767, -32768]), 4000, 1);
    expect(bytes).toHaveLength(44 + 10);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 10);
    expect(ascii(bytes, 8, 4)).toBe("WAVE");
    expect(ascii(bytes, 12, 4)).toBe("fmt ");
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(4000);
    expect(view.getUint32(28, true)).toBe(8000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(bytes, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(10);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(1000);
    expect(view.getInt16(48, true)).toBe(-1000);
    expect(view.getInt16(50, true)).toBe(32767);
    expect(view.getInt16(52, true)).toBe(-32768);
  });

  it("yazılan tampon kayıpsız geri okunur", () => {
    const samples = Int16Array.from({ length: 300 }, (_, index) => Math.round(Math.sin(index / 7) * 20000));
    const decoded = decodePcm16Wav(encodePcm16Wav(samples, 4000, 1));
    expect(decoded).not.toBeNull();
    expect(decoded!.sampleRate).toBe(4000);
    expect(decoded!.channels).toBe(1);
    expect([...decoded!.samples]).toEqual([...samples]);
  });

  it("bozuk veya eksik tamponu reddeder", () => {
    expect(decodePcm16Wav(new Uint8Array(10))).toBeNull();
    expect(decodePcm16Wav(new Uint8Array(44))).toBeNull();
  });
});

describe("KAUH RMS normalizasyonu ve 30 sn kırpma", () => {
  it("RMS hedefe (≈0.0333) normalize eder", () => {
    const samples = Int16Array.from({ length: 1000 }, (_, index) => 16384 + (index % 2 === 0 ? 4096 : -4096));
    const result = normalizePcm16(samples);
    expect(result.rmsNormalized).toBeCloseTo(0.0333, 3);
    expect(result.peakNormalized).toBeLessThanOrEqual(0.9);
  });

  it("tepe 0.9'u aşacaksa kazancı düşürür", () => {
    const samples = Int16Array.from({ length: 1000 }, (_, index) => (index % 10 === 0 ? 32767 : 1600));
    const result = normalizePcm16(samples);
    expect(result.peakNormalized).toBeLessThanOrEqual(0.9);
    expect(result.rmsNormalized).toBeLessThan(0.0333);
  });

  it("30 sn üzerini ilk 30 sn'ye kırpar", () => {
    const sampleRate = 4000;
    expect(truncatePcm16(new Int16Array(sampleRate * 31), sampleRate, 1)).toHaveLength(sampleRate * 30);
    expect(truncatePcm16(new Int16Array(sampleRate * 5), sampleRate, 1)).toHaveLength(sampleRate * 5);
  });
});

describe("KAUH dosya adı çözümleme ve tıbbi eşleme", () => {
  function entryOf(fileName: string) {
    const parsed = parseKauhFileName(fileName);
    if (parsed === null) throw new Error(`çözümlenemedi: ${fileName}`);
    return parsed;
  }

  it("dosya adı alanlarını çözer (bölge boşlukları temizlenir)", () => {
    expect(parseKauhFileName("DP100_N,N,P R M,70,F.wav")).toMatchObject({
      filter: "D",
      patientNo: "100",
      diagnosis: "N",
      sound: "N",
      region: "PRM",
      sex: "F",
    });
    expect(parseKauhFileName("BP10_Asthma,E W,P R U ,59,m.wav")).toMatchObject({
      filter: "B",
      diagnosis: "Asthma",
      sound: "E W",
      region: "PRU",
      sex: "M",
    });
    expect(parseKauhFileName("bozuk-dosya.wav")).toBeNull();
  });

  it("plan eşleme tablosunu uygular", () => {
    expect(mapKauhEntry(entryOf("DP100_N,N,P R M,70,F.wav"))).toEqual({
      finding: "normal",
      pointId: "lung_right_middle_posterior",
    });
    expect(mapKauhEntry(entryOf("DP10_Asthma,E W,P R U,59,M.wav"))).toEqual({
      finding: "wheezing",
      pointId: "lung_right_upper_posterior",
    });
    expect(mapKauhEntry(entryOf("DP11_Heart Failure,C,P L L,53,M.wav"))).toEqual({
      finding: "fine_crackles",
      pointId: "lung_left_lower_posterior",
    });
    expect(mapKauhEntry(entryOf("DP21_BRON,Crep,P R L ,20,M.wav"))).toEqual({
      finding: "coarse_crackles",
      pointId: "lung_right_lower_posterior",
    });
  });

  it("kapsam dışı kayıtları gerekçesiyle eler", () => {
    expect(mapKauhEntry(entryOf("DP105_Lung Fibrosis,Crep,A U R,44,M.wav"))).toEqual({
      skipped: "anterior bölge (kapsam dışı)",
    });
    expect(mapKauhEntry(entryOf("DP2_Asthma,E W,P L L R,52,F.wav"))).toEqual({ skipped: "belirsiz posterior bölge" });
    expect(mapKauhEntry(entryOf("DP69_pneumonia,Bronchial,P R L ,64,M.wav"))).toEqual({ skipped: "kapsam dışı ses etiketi" });
    expect(mapKauhEntry(entryOf("DP20_Asthma and lung fibrosis,C,A R M,90,M.wav"))).toEqual({
      skipped: "anterior bölge (kapsam dışı)",
    });
    expect(mapKauhEntry(entryOf("DP9_COPD,Crep,P R M,60,M.wav"))).toEqual({
      skipped: "eşlenmeyen ses-tanı kombinasyonu",
    });
  });
});
