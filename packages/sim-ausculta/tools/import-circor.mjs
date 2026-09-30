import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePcm16Wav, encodePcm16Wav, MAX_PEAK, MAX_SECONDS, normalizePcm16, TARGET_RMS, truncatePcm16 } from "./import-kauh.mjs";
import { circorPatientInfo, normalizePatientNo, splitCsvLine } from "./patient-info.mjs";
import { MAX_SAMPLES } from "./learning-samples.mjs";

const { console, process } = globalThis;

/**
 * T260 — PhysioNet CirCor DigiScope (v1.0.3, ODC-By 1.0) pediatrik gerçek hasta kalp
 * kayıtlarını sim paketine aktarır (plan: .egemed-run/plan.md). Eşleme tablosu
 * (Systolic murmur timing; Holosystolic ve Early-diastolic hiçbir konuya girmez):
 *
 *   Murmur = Absent        → normal
 *   Early-systolic         → early_systolic_murmur
 *   Mid-systolic           → mid_systolic_murmur
 *   Late-systolic          → late_systolic_murmur
 *
 * Seçim (deterministik): üfürüm konularında kayıt = hastanın Most audible location
 * dosyası; normalde sırasıyla AV → PV → TV → MV'den ilk mevcut. Üfürümde derece
 * önceliği III/VI → II/VI → I/VI, eşitlikte Patient ID artan; mümkünse karışık yaş
 * grubu ve cinsiyet (bölüm başına ilk tur çeşitlilik, ikinci tur kalanlar). Gebe
 * kayıtlar normal konuda en fazla 1 örnek (ileride gebe figürü için işaretlenir).
 * Öğrenme modunda her konu için en fazla `MAX_SAMPLES` gerçek hasta; T259'dan korunan
 * kayıt konu başına 1 yer tuttuğu için yeni hasta sayısı `MAX_PER_TOPIC`tir.
 *
 * T259 kayıtları (kimlikleri değerlendirme bankasına bağlı) aynen korunur; yeniden
 * üretilmez ve bu hastalar yeni seçime girmez. KVKK: hasta numarası yalnız iç
 * kimlikte (`internalPatientId`/`internalSourceId`) kalır; gösterilen hasta alanı
 * yaş grubu, cinsiyet, gebelik, odak ve ham ses tipini taşır, tanı bilgisi yoktur
 * (Outcome klinik sonuçtur, tanı değildir). Ses, KAUH aracındaki gibi RMS hedefi
 * ≈0.0333'e normalize edilir; tepe ≤ 0.9, 30 sn üzeri kırpılır, 4 kHz korunur.
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_CIRCOR_DIR = "/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-tools/datasets/circor/the-circor-digiscope-phonocardiogram-dataset-1.0.3";
const MANIFEST_PATH = join(PACKAGE_ROOT, "src/data/sounds-external.json");
const OUTPUT_DIR = join(PACKAGE_ROOT, "public/assets/audio/runtime/external/circor");

const DATASET_ID = "physionet-circor";
/** Öğrenme listesi konu başına en fazla `MAX_SAMPLES`; korunan kayıt 1 yer tutar. */
export const MAX_PER_TOPIC = MAX_SAMPLES - 1;

/** T259'dan korunan kayıtlar (değerlendirme bankası bu kimliklere bağlı) ve hastaları. */
export const LEGACY_RECORD_IDS = [
  "circor_normal_cardiac_aortic_001",
  "circor_mid_systolic_murmur_cardiac_aortic_001",
  "circor_early_systolic_murmur_cardiac_aortic_001",
  "circor_late_systolic_murmur_cardiac_aortic_001",
];
export const LEGACY_PATIENT_IDS = ["2530", "9979", "14241", "85132"];

/** Kayıt yeri kodu → simülasyon odak noktası. */
export const LOCATION_TO_POINT = {
  AV: "cardiac_aortic",
  PV: "cardiac_pulmonary",
  TV: "cardiac_tricuspid",
  MV: "cardiac_mitral",
};
/** Normal konuda kayıt yeri tercihi (plan: sırasıyla ilk mevcut). */
export const NORMAL_LOCATION_ORDER = ["AV", "PV", "TV", "MV"];

/** Zamanlama → kütüphane konusu + akustik bulgu (plan eşleme tablosu). */
export const CIRCOR_TOPIC_BY_TIMING = {
  "Early-systolic": { topic: "heart.murmur.early_systolic", finding: "early_systolic_murmur" },
  "Mid-systolic": { topic: "heart.murmur.mid_systolic", finding: "mid_systolic_murmur" },
  "Late-systolic": { topic: "heart.murmur.late_systolic", finding: "late_systolic_murmur" },
};
export const CIRCOR_TOPIC_ORDER = [
  "heart.normal",
  "heart.murmur.early_systolic",
  "heart.murmur.mid_systolic",
  "heart.murmur.late_systolic",
];
/** Akustik bulgu → kütüphane konusu (günlük özeti için). */
const FINDING_TOPIC = Object.fromEntries([
  ["normal", "heart.normal"],
  ...Object.values(CIRCOR_TOPIC_BY_TIMING).map((mapped) => [mapped.finding, mapped.topic]),
]);

function cleanCell(value) {
  const text = String(value ?? "").trim();
  return text.toLowerCase() === "nan" ? "" : text;
}

/** `training_data.csv` → satırlar (başlıklar birebir aranır; eksikse null).
 *  Hasta numarası yalnız iç kimlikte kullanılır, gösterilen alanlara girmez. */
export function parseCircorCsv(csvText) {
  const lines = String(csvText).replace(/^\ufeff/u, "").split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length < 2) return null;
  const header = splitCsvLine(lines[0]).map((name) => name.trim());
  const index = {
    patientId: header.indexOf("Patient ID"),
    recordingLocations: header.indexOf("Recording locations:"),
    age: header.indexOf("Age"),
    sex: header.indexOf("Sex"),
    pregnancy: header.indexOf("Pregnancy status"),
    murmur: header.indexOf("Murmur"),
    mostAudible: header.indexOf("Most audible location"),
    systolicTiming: header.indexOf("Systolic murmur timing"),
    diastolicTiming: header.indexOf("Diastolic murmur timing"),
    grading: header.indexOf("Systolic murmur grading"),
  };
  if (Object.values(index).some((column) => column < 0)) return null;
  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const value = (column) => cleanCell(cells[column]);
    const patientId = value(index.patientId);
    if (patientId === "") continue;
    rows.push({
      patientId,
      recordingLocations: value(index.recordingLocations)
        .split("+")
        .map((location) => location.trim().toUpperCase())
        .filter((location) => location !== ""),
      age: value(index.age),
      sex: value(index.sex),
      pregnancy: value(index.pregnancy),
      murmur: value(index.murmur),
      mostAudible: value(index.mostAudible),
      systolicTiming: value(index.systolicTiming),
      diastolicTiming: value(index.diastolicTiming),
      grading: value(index.grading),
    });
  }
  return rows;
}

/** Plan eşleme tablosu: bulgu ya da gerekçeli atlama. Holosistolik ve erken
 *  diyastolik üfürümlerin Ausculta karşılığı yoktur; hiçbir konuya girmez. */
export function mapCircorEntry(entry) {
  if (entry.murmur === "Absent") return { topic: "heart.normal", finding: "normal" };
  if (entry.murmur !== "Present") return { skipped: `murmur durumu kapsam dışı (${entry.murmur})` };
  const mapped = CIRCOR_TOPIC_BY_TIMING[entry.systolicTiming];
  if (mapped !== undefined) return mapped;
  if (entry.systolicTiming === "Holosystolic") return { skipped: "holosistolik üfürüm (Ausculta karşılığı yok)" };
  if (entry.diastolicTiming === "Early-diastolic") return { skipped: "erken diyastolik üfürüm (Ausculta karşılığı yok)" };
  return { skipped: `eşlenmeyen sistolik zamanlama (${entry.systolicTiming || "yok"})` };
}

/** Öğretici netlik önceliği: III/VI → II/VI → I/VI; diğer/boş derece en sonda. */
export function gradeRank(grading) {
  const text = cleanCell(grading);
  if (text === "III/VI") return 0;
  if (text === "II/VI") return 1;
  if (text === "I/VI") return 2;
  return 3;
}

/** Kayıt yeri seçimi: normal konuda AV → PV → TV → MV'den ilk mevcut; üfürümde
 *  yalnız hastanın Most audible location kaydı. Kayıt dosyası yoksa null. */
export function chooseLocation(finding, mostAudible, recordingLocations, hasFile) {
  const order = finding === "normal" ? NORMAL_LOCATION_ORDER : [cleanCell(mostAudible).toUpperCase()];
  for (const location of order) {
    if (location === "" || !recordingLocations.includes(location)) continue;
    if (hasFile(location)) return location;
  }
  return null;
}

function isPregnant(candidate) {
  return cleanCell(candidate.pregnancy).toLowerCase() === "true";
}

function compareCandidates(a, b) {
  return gradeRank(a.grading) - gradeRank(b.grading) || Number(a.patientId) - Number(b.patientId);
}

/** Bölüm içi ilk tur: yaş grubu + cinsiyet çeşitliliği; gebe sınırı (normal) ve
 *  kota dolduğunda ikinci tur kalanlar. Girdi sırasından bağımsız (deterministik). */
function chooseTopicPatients(list, limit, capPregnancy) {
  const chosen = [];
  const combinations = new Set();
  const keyOf = (candidate) => `${candidate.age}|${candidate.sex}`;
  const blocked = (candidate) =>
    chosen.includes(candidate) || (capPregnancy && isPregnant(candidate) && chosen.some(isPregnant));
  if (capPregnancy) {
    const pregnant = list.find(isPregnant);
    if (pregnant !== undefined) {
      chosen.push(pregnant);
      combinations.add(keyOf(pregnant));
    }
  }
  for (const candidate of list) {
    if (chosen.length >= limit) return chosen;
    if (blocked(candidate) || combinations.has(keyOf(candidate))) continue;
    chosen.push(candidate);
    combinations.add(keyOf(candidate));
  }
  for (const candidate of list) {
    if (chosen.length >= limit) break;
    if (blocked(candidate)) continue;
    chosen.push(candidate);
  }
  return chosen;
}

/** Adaylardan (eşlenmiş + kaydı bulunan) konu başına en fazla `maxPerTopic` hasta
 *  seçer; sıra konu sırası, sonra konu içi derece/hasta numarasıdır. */
export function selectCircorRecords(candidates, maxPerTopic = MAX_PER_TOPIC) {
  const byTopic = new Map();
  for (const candidate of candidates) {
    if (!byTopic.has(candidate.topic)) byTopic.set(candidate.topic, []);
    byTopic.get(candidate.topic).push(candidate);
  }
  const selected = [];
  for (const topic of CIRCOR_TOPIC_ORDER) {
    const list = (byTopic.get(topic) ?? []).slice().sort(compareCandidates);
    selected.push(...chooseTopicPatients(list, maxPerTopic, topic === "heart.normal"));
  }
  return selected;
}

/** Eşleme gerekçesi (öğretim üyesi onayı bekler): veri kümesi ölçütü ve kayıt yeri. */
export function circorMappingNote(candidate) {
  if (candidate.finding === "normal") {
    return `CirCor 'Murmur = Absent' (üfürüm yok); kayıt ${candidate.location} (öğretim üyesi onayı bekliyor)`;
  }
  const grading = cleanCell(candidate.grading) === "" ? "" : `, derece ${cleanCell(candidate.grading)}`;
  return `CirCor 'Systolic timing = ${candidate.timing}'${grading}; kayıt en belirgin odak ${candidate.location} (öğretim üyesi onayı bekliyor)`;
}

function buildRecord({ id, candidate, wav, normalized, durationSec }) {
  const redacted = id.replace(/^circor_/u, "");
  return {
    id,
    category: "heart",
    acousticFinding: candidate.finding,
    mappingStatus: "pending_faculty",
    mappingNote: circorMappingNote(candidate),
    sourceDataset: DATASET_ID,
    sourceFile: `circor/${redacted}`,
    internalSourceId: `circor-${redacted}`,
    internalPatientId: `circor-patient-${normalizePatientNo(candidate.patientId)}`,
    durationSec,
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    gainApplied: normalized.gainApplied,
    rmsNormalized: normalized.rmsNormalized,
    peakNormalized: normalized.peakNormalized,
    recordedLocation: candidate.location,
    simulationLocation: LOCATION_TO_POINT[candidate.location],
    nativeFilter: "unspecified",
    runtimeUrl: `assets/audio/runtime/external/circor/${id}.wav`,
    validationStatus: "validated",
    issues: [],
    patient: circorPatientInfo(candidate),
  };
}

/** T259 kayıtları yerinde korunur; yalnız bu aracın ürettiği yeni kayıtlar yazılır. */
function readManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const existing = Array.isArray(manifest.records) ? manifest.records : [];
  const kept = existing.filter(
    (record) => record.sourceDataset !== DATASET_ID || LEGACY_RECORD_IDS.includes(record.id),
  );
  return { manifest, kept };
}

function writeManifest(manifest, kept, newRecords) {
  const next = { ...manifest, records: [...kept, ...newRecords] };
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
  const sourceDir = process.env.CIRCOR_DIR ?? DEFAULT_CIRCOR_DIR;
  if (!existsSync(sourceDir)) {
    console.error(`CirCor kaynak klasörü bulunamadı: ${sourceDir}`);
    console.error("Kaynak kopyasının kökünü CIRCOR_DIR ile verin.");
    process.exitCode = 1;
    return;
  }
  const trainingDir = join(sourceDir, "training_data");
  const rows = parseCircorCsv(readFileSync(join(sourceDir, "training_data.csv"), "utf8"));
  if (rows === null) {
    console.error("training_data.csv başlıkları okunamadı.");
    process.exitCode = 1;
    return;
  }

  const skipped = new Map();
  const noteSkip = (reason) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const candidates = [];
  const hasFile = (patientId, location) => existsSync(join(trainingDir, `${patientId}_${location}.wav`));
  for (const row of rows) {
    const mapping = mapCircorEntry(row);
    if (mapping.skipped !== undefined) {
      noteSkip(mapping.skipped);
      continue;
    }
    const location = chooseLocation(mapping.finding, row.mostAudible, row.recordingLocations, (value) =>
      hasFile(row.patientId, value),
    );
    if (location === null) {
      noteSkip(mapping.finding === "normal" ? "normal kaydı yok" : "en belirgin odak kaydı yok");
      continue;
    }
    candidates.push({
      ...row,
      topic: mapping.topic,
      finding: mapping.finding,
      location,
      timing: row.systolicTiming,
    });
  }

  const selectable = candidates.filter((candidate) => !LEGACY_PATIENT_IDS.includes(candidate.patientId));
  const selected = selectCircorRecords(selectable);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const { manifest, kept } = readManifest();
  // Kimlik çakışması yalnız korunan kayıtlara karşı önlenir; yeni kayıtlar her
  // koşuda baştan üretildiği için kimlikleri sabittir (idempotent).
  const usedIds = new Set(kept.map((record) => record.id));
  const counters = new Map();
  const records = [];
  for (const candidate of selected) {
    const key = `${candidate.finding}|${candidate.location}`;
    let sequence = (counters.get(key) ?? 0) + 1;
    let id = `circor_${candidate.finding}_${LOCATION_TO_POINT[candidate.location]}_${String(sequence).padStart(3, "0")}`;
    while (usedIds.has(id)) {
      sequence += 1;
      id = `circor_${candidate.finding}_${LOCATION_TO_POINT[candidate.location]}_${String(sequence).padStart(3, "0")}`;
    }
    counters.set(key, sequence);
    usedIds.add(id);
    let wav = null;
    try {
      wav = decodePcm16Wav(readFileSync(join(trainingDir, `${candidate.patientId}_${candidate.location}.wav`)));
    } catch {
      wav = null;
    }
    if (wav === null) {
      noteSkip("WAV okunamadı/çözümlenemedi");
      continue;
    }
    const truncated = truncatePcm16(wav.samples, wav.sampleRate, wav.channels);
    const normalized = normalizePcm16(truncated);
    writeFileSync(join(OUTPUT_DIR, `${id}.wav`), encodePcm16Wav(normalized.samples, wav.sampleRate, wav.channels));
    records.push(
      buildRecord({
        id,
        candidate,
        wav,
        normalized,
        durationSec: Number((truncated.length / wav.channels / wav.sampleRate).toFixed(2)),
      }),
    );
  }

  const keepIds = new Set([...LEGACY_RECORD_IDS, ...records.map((record) => record.id)]);
  const removed = cleanupOutput(keepIds);
  const written = writeManifest(manifest, kept, records);

  console.log("CirCor DigiScope v1.0.3 → sounds-external.json");
  console.log(`Kaynak: ${sourceDir}`);
  console.log(`Hasta satırı: ${rows.length}, eşlenen aday: ${candidates.length}`);
  console.log(`Alınan kayıt: ${records.length} (bildirimde toplam ${written.total}, korunan ${written.kept})`);
  console.log(`Çıktı: ${OUTPUT_DIR}${removed > 0 ? ` (${removed} eski dosya silindi)` : ""}`);
  for (const [reason, count] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  atlandı — ${reason}: ${count}`);
  }
  console.log("Konu × seçim:");
  for (const topic of CIRCOR_TOPIC_ORDER) {
    const chosen = records.filter((record) => (FINDING_TOPIC[record.acousticFinding] ?? "heart.normal") === topic);
    console.log(`  ${topic}: ${chosen.length} yeni`);
  }
  for (const record of records) {
    console.log(
      `  ${record.id}: ${record.patient.ageGroup ?? "?"}/${record.patient.sex ?? "?"}` +
        `${record.patient.pregnant ? " (gebe)" : ""} — ${record.patient.soundTypeRaw}, ${record.patient.site}`,
    );
  }
  console.log(`RMS hedef ${TARGET_RMS}, tepe ≤ ${MAX_PEAK}, kırpma ${MAX_SECONDS} sn`);
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
