import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { kauhPatientInfo } from "./patient-info.mjs";

const { console, process } = globalThis;

/**
 * T227 — KAUH v3 (Fraiwan ve ark., Mendeley Data 10.17632/jwyy9np4gv.3, CC BY 4.0)
 * gerçek hastadan bölge etiketli POSTERIOR akciğer kayıtlarını sim paketine aktarır
 * (plan: .egemed-run/plan.md). Yalnız D (diyafram) filtresi alınır; eşleme tablosu:
 *
 *   N/N                     → normal
 *   E W / {Asthma, COPD}    → wheezing
 *   {Crep, C} / {Heart Failure, Lung Fibrosis} → fine_crackles
 *   {Crep, C} / {BRON, pneumonia}              → coarse_crackles
 *
 * Anterior bölgeler, belirsiz posterior kodlar (PLR/PLLR/P) ve kapsam dışı ses/tanı
 * etiketleri alınmaz. Kayıtlar RMS hedefi ≈0.0333'e (HLS rmsNormalized) normalize
 * edilir; tepe ≤ 0.9 korunur, 30 sn üzeri kırpılır.
 *
 * T259: kayda gösterilen hasta alanı (`patient`) eklenir — yaş, cinsiyet, Türkçe
 * tanı (bronşit dahil; eşleme `patient-info.mjs`), ham ses tipi ve Türkçe dinleme
 * yeri. KVKK: hasta adı ve özgün dosya adı kaydedilmez; hasta numarası yalnız iç
 * kimlikte (`internalSourceId`, mevcut desen) kalır. WAV oku/yaz saf Node (PCM16).
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_KAUH_DIR = "/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-tools/datasets/kauh/audio";
const MANIFEST_PATH = join(PACKAGE_ROOT, "src/data/sounds-external.json");
const OUTPUT_DIR = join(PACKAGE_ROOT, "public/assets/audio/runtime/external/kauh");

const DATASET_ID = "kauh-v3";
/** HLS kayıtlarındaki rmsNormalized referansı (plan: ≈0.0333) ve tepe tavanı. */
export const TARGET_RMS = 0.0333;
export const MAX_PEAK = 0.9;
export const MAX_SECONDS = 30;

const REGION_TO_POINT = {
  PRU: "lung_right_upper_posterior",
  PLU: "lung_left_upper_posterior",
  PRM: "lung_right_middle_posterior",
  PLM: "lung_left_middle_posterior",
  PRL: "lung_right_lower_posterior",
  PLL: "lung_left_lower_posterior",
};

const EXCLUDED_SOUNDS = new Set(["i e w", "i c e w", "i c b", "i c", "bronchial"]);
const UNSUPPORTED_DIAGNOSES = new Set(["plueral effusion"]);
const DIAGNOSIS_LABELS = {
  n: "normal",
  asthma: "astım",
  copd: "KOAH",
  "heart failure": "kalp yetmezliği",
  "lung fibrosis": "akciğer fibrozu",
  bron: "bronşit",
  pneumonia: "pnömoni",
};

function readAscii(view, offset, length) {
  let out = "";
  for (let index = 0; index < length; index += 1) out += String.fromCharCode(view.getUint8(offset + index));
  return out;
}

function writeAscii(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

/** PCM16 WAV çözücü (chunk yürüyüşü; ek LIST/JUNK chunk'larına dayanıklı). */
export function decodePcm16Wav(bytes) {
  if (bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") return null;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataBytes = 0;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (chunkId === "fmt " && chunkSize >= 16 && body + 16 <= bytes.byteLength) {
      audioFormat = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (chunkId === "data") {
      dataOffset = body;
      dataBytes = Math.min(chunkSize, bytes.byteLength - body);
    }
    offset = body + chunkSize + (chunkSize % 2);
  }
  if (audioFormat !== 1 || bitsPerSample !== 16 || dataOffset < 0 || channels < 1) return null;
  const frames = Math.floor(dataBytes / 2 / channels);
  const sampleCount = frames * channels;
  const samples = new Int16Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(dataOffset + index * 2, true);
  }
  return { sampleRate, channels, samples };
}

/** Kanonik 44 baytlık PCM16 WAV başlığı + örnekler. */
export function encodePcm16Wav(samples, sampleRate, channels) {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index += 1) {
    view.setInt16(44 + index * 2, samples[index], true);
  }
  return new Uint8Array(buffer);
}

/** 30 sn üzerini ilk 30 sn'ye kırpar (frame hizalı). */
export function truncatePcm16(samples, sampleRate, channels, maxSeconds = MAX_SECONDS) {
  const limit = Math.floor(sampleRate * channels * maxSeconds);
  return samples.length > limit ? samples.slice(0, limit) : samples;
}

/** RMS hedefe normalize eder; tepe sınırı aşılırsa kazancı düşürür (plan kuralı). */
export function normalizePcm16(samples, targetRms = TARGET_RMS, maxPeak = MAX_PEAK) {
  let sumSquares = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] / 32768;
    sumSquares += value * value;
    const magnitude = Math.abs(value);
    if (magnitude > peak) peak = magnitude;
  }
  const rms = samples.length > 0 ? Math.sqrt(sumSquares / samples.length) : 0;
  let gain = rms > 0 ? targetRms / rms : 0;
  if (peak > 0 && peak * gain > maxPeak) gain = maxPeak / peak;
  const gainApplied = Number(gain.toFixed(3));
  const output = new Int16Array(samples.length);
  let outSumSquares = 0;
  let outPeak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    let scaled = Math.round(samples[index] * gainApplied);
    if (scaled > 32767) scaled = 32767;
    if (scaled < -32768) scaled = -32768;
    output[index] = scaled;
    const value = scaled / 32768;
    outSumSquares += value * value;
    const magnitude = Math.abs(value);
    if (magnitude > outPeak) outPeak = magnitude;
  }
  return {
    samples: output,
    gainApplied,
    rmsNormalized: Number((output.length > 0 ? Math.sqrt(outSumSquares / output.length) : 0).toFixed(4)),
    peakNormalized: Number(outPeak.toFixed(4)),
  };
}

/** `<F>P<no>_<tanı>,<ses>,<bölge>,<yaş>,<cinsiyet>.wav` → alanlar (bölge boşluksuz/BÜYÜK).
 *  Yaş T259 hasta alanında gösterilir; hasta numarası/adı yalnız iç kimlikte kalır. */
export function parseKauhFileName(fileName) {
  const match = /^([BDE])P(\d+)_(.+)\.wav$/i.exec(fileName);
  if (match === null) return null;
  const parts = match[3].split(",");
  if (parts.length !== 5) return null;
  const diagnosis = (parts[0] ?? "").trim();
  const sound = (parts[1] ?? "").trim();
  const region = (parts[2] ?? "").trim();
  const age = (parts[3] ?? "").trim();
  const sex = (parts[4] ?? "").trim();
  if (!diagnosis || !sound || !region || !sex) return null;
  return {
    filter: match[1].toUpperCase(),
    patientNo: match[2],
    diagnosis,
    sound,
    region: region.replace(/\s+/g, "").toUpperCase(),
    age,
    sex: sex.toUpperCase(),
  };
}

/** Parse edilmiş dosya adını bulgu + nokta eşlemesine çevirir; kapsam dışıysa gerekçe döner. */
export function mapKauhEntry(entry) {
  const sound = entry.sound.toLowerCase();
  const diagnosis = entry.diagnosis.toLowerCase();
  if (EXCLUDED_SOUNDS.has(sound)) return { skipped: "kapsam dışı ses etiketi" };
  const pointId = REGION_TO_POINT[entry.region];
  if (pointId === undefined) {
    return { skipped: entry.region.startsWith("A") ? "anterior bölge (kapsam dışı)" : "belirsiz posterior bölge" };
  }
  if (diagnosis.includes("+") || /\band\b/u.test(diagnosis)) return { skipped: "karma tanı (kapsam dışı)" };
  if (UNSUPPORTED_DIAGNOSES.has(diagnosis)) return { skipped: "kapsam dışı tanı (Plueral Effusion)" };
  const finding = findingFor(sound, diagnosis);
  if (finding === null) return { skipped: "eşlenmeyen ses-tanı kombinasyonu" };
  return { finding, pointId };
}

function findingFor(sound, diagnosis) {
  if (sound === "n" && diagnosis === "n") return "normal";
  if (sound === "e w" && (diagnosis === "asthma" || diagnosis === "copd")) return "wheezing";
  if ((sound === "crep" || sound === "c") && (diagnosis === "heart failure" || diagnosis === "lung fibrosis")) {
    return "fine_crackles";
  }
  if ((sound === "crep" || sound === "c") && (diagnosis === "bron" || diagnosis === "pneumonia")) {
    return "coarse_crackles";
  }
  return null;
}

/** Tanı + bulgu eşleme gerekçesi (öğretim üyesi onayı bekler). */
export function mappingNote(finding, entry) {
  const label = DIAGNOSIS_LABELS[entry.diagnosis.toLowerCase()] ?? entry.diagnosis;
  if (finding === "normal") {
    return "KAUH 'N' (normal solunum), tanı 'N' → normal (öğretim üyesi onayı bekliyor)";
  }
  if (finding === "wheezing") {
    return `KAUH 'E W', ${label} → hışıltı (wheezing) (öğretim üyesi onayı bekliyor)`;
  }
  if (finding === "fine_crackles") {
    return `KAUH '${entry.sound}', ${label} → ince raller (öğretim üyesi onayı bekliyor)`;
  }
  return `KAUH '${entry.sound}', ${label} → kaba raller (öğretim üyesi onayı bekliyor)`;
}

function buildRecord({ id, entry, mapping, wav, normalized }) {
  return {
    id,
    category: "lung",
    acousticFinding: mapping.finding,
    mappingStatus: "pending_faculty",
    mappingNote: mappingNote(mapping.finding, entry),
    sourceDataset: DATASET_ID,
    sourceFile: `kauh/DP${entry.patientNo}`,
    internalSourceId: `kauh-patient-${entry.patientNo}`,
    durationSec: Number((wav.samples.length / wav.channels / wav.sampleRate).toFixed(2)),
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    gainApplied: normalized.gainApplied,
    rmsNormalized: normalized.rmsNormalized,
    peakNormalized: normalized.peakNormalized,
    recordedLocation: entry.region,
    simulationLocation: mapping.pointId,
    nativeFilter: "diaphragm",
    gender: entry.sex,
    runtimeUrl: `assets/audio/runtime/external/kauh/${id}.wav`,
    validationStatus: "validated",
    issues: [],
    patient: kauhPatientInfo(entry),
  };
}

function writeManifest(records) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const kept = (Array.isArray(manifest.records) ? manifest.records : []).filter(
    (record) => record.sourceDataset !== DATASET_ID,
  );
  const next = { ...manifest, records: [...kept, ...records] };
  next.count = next.records.length;
  writeFileSync(MANIFEST_PATH, JSON.stringify(next, null, 2));
  return { kept: kept.length, total: next.count };
}

function cleanupOutput(keepIds) {
  if (!existsSync(OUTPUT_DIR)) return 0;
  let removed = 0;
  for (const name of readdirSync(OUTPUT_DIR)) {
    if (!name.endsWith(".wav") || keepIds.has(name.slice(0, -4))) continue;
    rmSync(join(OUTPUT_DIR, name));
    removed += 1;
  }
  return removed;
}

function main() {
  const sourceDir = process.env.KAUH_DIR ?? DEFAULT_KAUH_DIR;
  if (!existsSync(sourceDir)) {
    console.error(`KAUH kaynak klasörü bulunamadı: ${sourceDir}`);
    console.error("Kaynak kopyasının kökünü KAUH_DIR ile verin.");
    process.exitCode = 1;
    return;
  }

  const files = readdirSync(sourceDir)
    .filter((name) => /^DP\d+_.+\.wav$/i.test(name))
    .sort();
  const skipped = new Map();
  const counters = new Map();
  const table = new Map();
  const records = [];
  const keepIds = new Set();
  const noteSkip = (reason) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const fileName of files) {
    const entry = parseKauhFileName(fileName);
    if (entry === null) {
      noteSkip("dosya adı çözümlenemedi");
      continue;
    }
    if (entry.filter !== "D") {
      noteSkip("D dışı filtre");
      continue;
    }
    const mapping = mapKauhEntry(entry);
    if (mapping.skipped !== undefined) {
      noteSkip(mapping.skipped);
      continue;
    }
    let wav = null;
    try {
      wav = decodePcm16Wav(readFileSync(join(sourceDir, fileName)));
    } catch {
      wav = null;
    }
    if (wav === null) {
      noteSkip("WAV okunamadı/çözümlenemedi");
      continue;
    }
    const truncated = truncatePcm16(wav.samples, wav.sampleRate, wav.channels);
    const normalized = normalizePcm16(truncated);
    const key = `${mapping.finding}|${mapping.pointId}`;
    const sequence = (counters.get(key) ?? 0) + 1;
    counters.set(key, sequence);
    const id = `kauh_${mapping.finding}_${mapping.pointId}_${String(sequence).padStart(3, "0")}`;
    writeFileSync(join(OUTPUT_DIR, `${id}.wav`), encodePcm16Wav(normalized.samples, wav.sampleRate, wav.channels));
    keepIds.add(id);
    table.set(key, (table.get(key) ?? 0) + 1);
    records.push(buildRecord({ id, entry, mapping, wav, normalized }));
  }

  const removed = cleanupOutput(keepIds);
  const manifest = writeManifest(records);

  console.log("KAUH v3 → sounds-external.json");
  console.log(`Kaynak: ${sourceDir}`);
  console.log(`D filtresi dosyası: ${files.length}`);
  console.log(`Alınan kayıt: ${records.length} (bildirimde toplam ${manifest.total}, korunan ${manifest.kept})`);
  const incomplete = records.filter(
    (record) => record.patient.diagnosis === null || record.patient.ageYears === null || record.patient.sex === null,
  ).length;
  console.log(`Hasta alanı: ${records.length - incomplete}/${records.length} tam (yaş, cinsiyet, tanı)`);
  console.log(`Çıktı: ${OUTPUT_DIR}${removed > 0 ? ` (${removed} eski dosya silindi)` : ""}`);
  for (const [reason, count] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  atlandı — ${reason}: ${count}`);
  }
  console.log("Nokta × bulgu:");
  for (const [key, count] of [...table.entries()].sort()) {
    const [finding, pointId] = key.split("|");
    console.log(`  ${pointId} ${finding}: ${count}`);
  }
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
