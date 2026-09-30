import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePcm16Wav, encodePcm16Wav, MAX_PEAK, MAX_SECONDS, normalizePcm16, TARGET_RMS, truncatePcm16 } from "./import-kauh.mjs";
import { normalizePatientNo, parsePatientSummaryCsv, sprsoundPatientInfo } from "./patient-info.mjs";

const { console, process } = globalThis;

/**
 * T234 — SPRSound (SJTU Paediatric Respiratory Sound Database, IEEE TBioCAS 2022,
 * DOI 10.1109/TBCAS.2022.3204910, CC BY 4.0) pediatrik kayıtlarından SOL/SAĞ
 * POSTERIOR (p1/p3) "saf" ronküs ve wheezing kayıtlarını sim paketine aktarır
 * (plan: .egemed-run/plan.md). Seçim kuralı: record_annotation Poor Quality
 * olmayacak; Normal dışı olayların tamamı TEK türde olacak (Rhonchi ya da
 * Wheeze); olay kapsamı (tür toplam süresi / kayıt süresi) ≥ %30; taraf ve
 * bulgu başına en fazla 3 kayıt. Sıralama deterministik: kapsam azalan,
 * eşitlikte dosya adı. Kaynakta seviye (üst/alt) yok; p1 → sol ALT (1. seçim)
 * ve sol ÜST (2. seçim), p3 → sağ ALT ve sağ ÜST noktalarına dönüşümlü atanır.
 *
 * T259 hasta alanı: yaş ve cinsiyet dosya adından, tanı `Patient Summary/*.csv`
 * özetlerinden (sıra: SPRSound → Grand Challenge'23 → '24) gelir; özet bulunamazsa
 * tanı null kalır. KVKK: özgün dosya adı ve hasta numarası gösterilen alanlara
 * girmez; hasta numarası karşılaştırma için yalnız iç kimlikte
 * (`internalPatientId`) tutulur, yaş/cinsiyet/tanı/yer `patient` alanındadır.
 * Aynı kayıt birden çok klasörde kopya olabilir; dosya adına göre tekilleştirilir.
 * Kayıtlar RMS hedefi ≈0.0333'e normalize edilir; tepe ≤ 0.9, 30 sn üzeri kırpılır,
 * 8 kHz örnekleme korunur. Yeni bağımlılık yok; WAV kodeği import-kauh.mjs'ten gelir.
 */

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SPRSOUND_DIR = "/Users/ozankaraca/Documents/Codex/2026-09-23/egemed-tools/datasets/sprsound";
const MANIFEST_PATH = join(PACKAGE_ROOT, "src/data/sounds-external.json");
const OUTPUT_DIR = join(PACKAGE_ROOT, "public/assets/audio/runtime/external/sprsound");

const DATASET_ID = "sprsound";
/** Plan: kapsamı %30'un altındaki kayıtlar alınmaz; taraf ve bulgu başına en fazla 3 kayıt. */
export const MIN_COVERAGE = 0.3;
export const MAX_PER_BUCKET = 3;

/** Konum → simülasyon noktası tercih sırası: 1. seçim alt, 2. seçim üst posterior.
 *  Kaynakta seviye bilgisi yoktur; bu atama eğitim amaçlıdır (öğretim üyesi onayı bekler). */
export const SPRSOUND_POINTS = {
  p1: ["lung_left_lower_posterior", "lung_left_upper_posterior"],
  p3: ["lung_right_lower_posterior", "lung_right_upper_posterior"],
};

export const MAPPING_NOTE =
  "SPRSound sol/sağ posterior; seviye kaynakta yok — üst/alt ataması eğitim amaçlı (öğretim üyesi onayı bekliyor)";

/** `<hastaNo>_<yaş>_<cinsiyet>_<konum>_<kayıtNo>.wav` → alanlar.
 *  Alanlar burada çözümlenir ama kayda yalnız konum ve kayıt numarası geçer (KVKK). */
export function parseSprsoundFileName(fileName) {
  const match = /^(\d+)_([\d.]+)_([01])_(p\d+)_(\d+)\.wav$/u.exec(fileName);
  if (match === null) return null;
  return {
    patientNo: match[1],
    age: match[2],
    gender: match[3],
    location: match[4],
    recordNo: match[5],
  };
}

/** Kayıt düzeyi + olay düzeyi anotasyondan tek tür "saf" bulguyu çıkarır.
 *  Poor Quality, karma olay türleri (ör. Rhonchi+Wheeze, Stridor, raller) ve
 *  Normal dışı olayı olmayan kayıtlar gerekçesiyle elenir. */
export function findingForAnnotation(annotation) {
  if (annotation === null || typeof annotation !== "object") return { skipped: "anotasyon okunamadı" };
  const record = annotation.record_annotation;
  if (typeof record !== "string") return { skipped: "kayıt düzeyi anotasyon yok" };
  if (record === "Poor Quality") return { skipped: "Poor Quality (düşük sinyal kalitesi)" };
  if (!Array.isArray(annotation.event_annotation)) return { skipped: "olay anotasyonu yok" };
  const types = [
    ...new Set(
      annotation.event_annotation
        .map((event) => (event !== null && typeof event === "object" && typeof event.type === "string" ? event.type : ""))
        .filter((type) => type !== "" && type !== "Normal"),
    ),
  ];
  if (types.length === 0) return { skipped: "Normal dışı olay yok" };
  if (types.length > 1) return { skipped: `karma olay türleri (${types.sort().join("+")})` };
  const type = types[0];
  if (type === "Rhonchi") return { finding: "rhonchi" };
  if (type === "Wheeze") return { finding: "wheezing" };
  return { skipped: `eşlenmeyen olay türü (${type})` };
}

/** Kapsam = bulguya ait olayların toplam süresi (ms→sn) / kayıt süresi (sn). */
export function coverageOf(annotation, finding, durationSec) {
  if (!(durationSec > 0) || annotation === null || typeof annotation !== "object" || !Array.isArray(annotation.event_annotation)) {
    return 0;
  }
  const type = finding === "rhonchi" ? "Rhonchi" : "Wheeze";
  let milliseconds = 0;
  for (const event of annotation.event_annotation) {
    if (event === null || typeof event !== "object" || event.type !== type) continue;
    const start = Number(event.start);
    const end = Number(event.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) milliseconds += end - start;
  }
  return milliseconds / 1000 / durationSec;
}

/** Taraf içi kayıt sırasına göre nokta: 0 → alt (1. seçim), 1 → üst, 2 → alt. */
export function pointForLocation(location, index) {
  const points = SPRSOUND_POINTS[location];
  if (points === undefined) return null;
  return points[index % points.length] ?? null;
}

/**
 * Aday listesinden (dosya adı benzersiz) saf seçim: kapsam eşiği, bulgu/konum
 * kovalarında kapsam azalan + dosya adı sıralaması, kova başına en fazla
 * `MAX_PER_BUCKET` kayıt ve dönüşümlü nokta ataması. Deterministik; dosya
 * sistemi yok. Dönen `skipped` gerekçe → sayıdır.
 */
export function selectSprsoundRecords(entries) {
  const skipped = new Map();
  const note = (reason) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);
  const seen = new Set();
  const buckets = new Map();
  for (const entry of entries) {
    if (seen.has(entry.fileName)) {
      note("dosya adı kopyası (tekilleştirme)");
      continue;
    }
    seen.add(entry.fileName);
    const result = findingForAnnotation(entry.annotation);
    if (result.skipped !== undefined) {
      note(result.skipped);
      continue;
    }
    const finding = result.finding;
    const coverage = Number(coverageOf(entry.annotation, finding, entry.durationSec).toFixed(4));
    if (coverage < MIN_COVERAGE) {
      note(`kapsam %${Math.round(MIN_COVERAGE * 100)} altı (${finding})`);
      continue;
    }
    const key = `${finding}|${entry.location}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ ...entry, finding, coverage });
  }
  const selected = [];
  for (const entry of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const list = entry[1];
    list.sort((a, b) => b.coverage - a.coverage || a.fileName.localeCompare(b.fileName));
    for (const [rank, entry] of list.slice(0, MAX_PER_BUCKET).entries()) {
      const pointId = pointForLocation(entry.location, rank);
      if (pointId === null) continue;
      selected.push({ ...entry, pointId, rank });
    }
  }
  return { selected, skipped };
}

/** Kayıt alanları KAUH ile aynı; gösterilen hasta alanı yalnız yaş/cinsiyet/tanı/yer
 *  taşır (KVKK). Hasta numarası iç kimlikte (`internalPatientId`) kalır. */
function buildRecord({ id, selected, wav, normalized, patient }) {
  return {
    id,
    category: "lung",
    acousticFinding: selected.finding,
    mappingStatus: "pending_faculty",
    mappingNote: MAPPING_NOTE,
    sourceDataset: DATASET_ID,
    sourceFile: `sprsound/${selected.recordNo}`,
    internalSourceId: `sprsound-${selected.recordNo}`,
    internalPatientId: `sprsound-patient-${normalizePatientNo(selected.patientNo)}`,
    durationSec: Number((wav.samples.length / wav.channels / wav.sampleRate).toFixed(2)),
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    gainApplied: normalized.gainApplied,
    rmsNormalized: normalized.rmsNormalized,
    peakNormalized: normalized.peakNormalized,
    recordedLocation: selected.location,
    simulationLocation: selected.pointId,
    population: "pediatric",
    nativeFilter: "unspecified",
    runtimeUrl: `assets/audio/runtime/external/sprsound/${id}.wav`,
    validationStatus: "validated",
    issues: [],
    patient,
  };
}

/** Hasta özeti dosyaları öncelik sırası: özgün SPRSound özeti önce, sonra yarışma yılları. */
const SUMMARY_FILES = ["SPRSound_patient_summary.csv", "Grand_Challenge'23_patient_summary.csv", "Grand_Challenge'24_patient_summary.csv"];

/** `Patient Summary/*.csv` → Map(hastaNo → { disease, source }); ilk dosya kazanır. */
function readPatientSummaries(dir) {
  const summaries = new Map();
  const used = [];
  for (const name of SUMMARY_FILES) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    used.push(name);
    for (const [patientNo, disease] of parsePatientSummaryCsv(readFileSync(path, "utf8"))) {
      if (!summaries.has(patientNo)) summaries.set(patientNo, { disease, source: name });
    }
  }
  return { summaries, used };
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

/** Kaynak ağacını yürür, `.wav` ve `.json` dosyalarını deterministik sırayla toplar. */
function walk(root) {
  const wavs = [];
  const jsons = [];
  const pending = [root];
  while (pending.length > 0) {
    const dir = pending.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (entry.isFile() && entry.name.endsWith(".wav")) wavs.push(full);
      else if (entry.isFile() && entry.name.endsWith(".json")) jsons.push(full);
    }
  }
  return { wavs: wavs.sort(), jsons: jsons.sort() };
}

function main() {
  const sourceDir = process.env.SPRSOUND_DIR ?? DEFAULT_SPRSOUND_DIR;
  if (!existsSync(sourceDir)) {
    console.error(`SPRSound kaynak klasörü bulunamadı: ${sourceDir}`);
    console.error("Kaynak kopyasının kökünü SPRSOUND_DIR ile verin.");
    process.exitCode = 1;
    return;
  }

  const stats = { wav: 0, unique: 0, candidate: 0, unreadable: 0, badName: 0, lateral: 0 };
  const summaryDir = join(sourceDir, "Patient Summary");
  const { summaries, used } = existsSync(summaryDir) ? readPatientSummaries(summaryDir) : { summaries: new Map(), used: [] };
  if (used.length === 0) console.warn(`Hasta özeti bulunamadı: ${summaryDir} — tanılar boş kalacak.`);
  const { wavs, jsons } = walk(sourceDir);
  stats.wav = wavs.length;
  const jsonByName = new Map();
  for (const path of jsons) {
    const base = path.slice(path.lastIndexOf("/") + 1);
    if (!jsonByName.has(base)) jsonByName.set(base, []);
    jsonByName.get(base).push(path);
  }

  const seen = new Set();
  const entries = [];
  const wavByFile = new Map();
  for (const path of wavs) {
    const fileName = path.slice(path.lastIndexOf("/") + 1);
    if (seen.has(fileName)) continue;
    seen.add(fileName);
    stats.unique += 1;
    const parsed = parseSprsoundFileName(fileName);
    if (parsed === null) {
      stats.badName += 1;
      continue;
    }
    if (SPRSOUND_POINTS[parsed.location] === undefined) {
      stats.lateral += 1;
      continue;
    }
    let annotation = null;
    for (const jsonPath of jsonByName.get(fileName.replace(/\.wav$/u, ".json")) ?? []) {
      try {
        const parsedJson = JSON.parse(readFileSync(jsonPath, "utf8"));
        if (parsedJson !== null && typeof parsedJson.record_annotation === "string" && Array.isArray(parsedJson.event_annotation)) {
          annotation = parsedJson;
          break;
        }
      } catch {
        /* bozuk JSON: sıradaki kopya denenir */
      }
    }
    if (annotation === null) {
      stats.unreadable += 1;
      continue;
    }
    let wav = null;
    try {
      wav = decodePcm16Wav(readFileSync(path));
    } catch {
      wav = null;
    }
    if (wav === null) {
      stats.unreadable += 1;
      continue;
    }
    stats.candidate += 1;
    wavByFile.set(fileName, wav);
    entries.push({
      fileName,
      recordNo: parsed.recordNo,
      patientNo: parsed.patientNo,
      age: parsed.age,
      gender: parsed.gender,
      location: parsed.location,
      annotation,
      durationSec: wav.samples.length / wav.channels / wav.sampleRate,
    });
  }

  const { selected, skipped } = selectSprsoundRecords(entries);
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const counters = new Map();
  const records = [];
  const keepIds = new Set();
  for (const entry of selected) {
    const wav = wavByFile.get(entry.fileName);
    if (wav === undefined) continue;
    const key = `${entry.finding}|${entry.pointId}`;
    const sequence = (counters.get(key) ?? 0) + 1;
    counters.set(key, sequence);
    const id = `sprsound_${entry.finding}_${entry.pointId}_${String(sequence).padStart(3, "0")}`;
    const truncated = truncatePcm16(wav.samples, wav.sampleRate, wav.channels);
    const normalized = normalizePcm16(truncated);
    writeFileSync(join(OUTPUT_DIR, `${id}.wav`), encodePcm16Wav(normalized.samples, wav.sampleRate, wav.channels));
    keepIds.add(id);
    const summary = summaries.get(normalizePatientNo(entry.patientNo)) ?? null;
    const patient = sprsoundPatientInfo(entry, entry.finding, summary);
    records.push(buildRecord({ id, selected: entry, wav, normalized, patient }));
  }

  const removed = cleanupOutput(keepIds);
  const manifest = writeManifest(records);

  console.log("SPRSound → sounds-external.json");
  console.log(`Kaynak: ${sourceDir}`);
  console.log(
    `WAV: ${stats.wav} (benzersiz ${stats.unique}) — p1/p3 ${stats.candidate} aday; ` +
      `yan bölge ${stats.lateral}, ad çözümlenemedi ${stats.badName}, okunamadı ${stats.unreadable}`,
  );
  console.log(`Alınan kayıt: ${records.length} (manifest toplam ${manifest.total}, korunan ${manifest.kept})`);
  const withDiagnosis = records.filter((record) => record.patient.diagnosis !== null).length;
  console.log(`Hasta alanı: ${withDiagnosis}/${records.length} tanılı (hasta özeti: ${used.join(", ") || "yok"})`);
  console.log(`Çıktı: ${OUTPUT_DIR}${removed > 0 ? ` (${removed} eski dosya silindi)` : ""}`);
  for (const [reason, count] of [...skipped.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  atlandı — ${reason}: ${count}`);
  }
  console.log("Nokta × bulgu (kapsam azalan):");
  for (const entry of selected) {
    console.log(`  ${entry.pointId} ${entry.finding}: ${entry.fileName} (kapsam %${(entry.coverage * 100).toFixed(1)})`);
  }
  console.log(`RMS hedef ${TARGET_RMS}, tepe ≤ ${MAX_PEAK}, kırpma ${MAX_SECONDS} sn`);
}

const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
