/**
 * T259 — KAUH ve SPRSound gerçek hasta kayıtlarının kullanıcıya gösterilen hasta
 * alanları (yaş, cinsiyet, Türkçe tanı, ham ses tipi, dinleme yeri). Tanı eşlemesi
 * plan tablosuyla birebir uygulanır; eşlenmeyen tanı ham haliyle korunur. BRON
 * kısaltması veri kümesi makalesine göre bronşittir (Data in Brief 2021, Tablo 1:
 * yedi hastalık arasında bronşit; bronşektazi yok).
 *
 * KVKK: ad, özgün dosya adı ve kaynak hasta numarası bu alanlara asla girmez.
 */

export const DIAGNOSIS_SOURCE = {
  "kauh-v3": "KAUH tablosu",
  sprsound: "SPRSound hasta özeti",
};

/** Plan tanı tablosu: KAUH (anahtar küçük harf eşleme). */
const KAUH_DIAGNOSIS_TR = {
  n: "Tanı yok (normal)",
  asthma: "Astım",
  "heart failure": "Kalp yetersizliği",
  copd: "KOAH",
  pneumonia: "Pnömoni",
  "lung fibrosis": "Akciğer fibrozisi",
  "plueral effusion": "Plevral efüzyon",
  bron: "Bronşit",
};

/** Plan tanı tablosu: SPRSound (kaynak yazımları dahil). */
const SPRSOUND_DIAGNOSIS_TR = {
  "pneumonia (non-severe)": "Pnömoni (ağır olmayan)",
  "pneumonia (severe)": "Ağır pnömoni",
  bronchitis: "Bronşit",
  asthma: "Astım",
  "control group": "Kontrol grubu (hastalık yok)",
  "acute upper respiratory infection": "Akut üst solunum yolu enfeksiyonu",
  bronchiectasia: "Bronşektazi",
  bronchiolitis: "Bronşiolit",
  "other respiratory diseases": "Diğer solunum hastalıkları",
  "other respiratory": "Diğer solunum hastalıkları",
};

/** Dinleme yeri: KAUH bölge kodu → uygulama terminolojisi (bölge (posterior)). */
const KAUH_SITE_TR = {
  PRU: "Sağ üst bölge (posterior)",
  PLU: "Sol üst bölge (posterior)",
  PRM: "Sağ orta bölge (posterior)",
  PLM: "Sol orta bölge (posterior)",
  PRL: "Sağ alt bölge (posterior)",
  PLL: "Sol alt bölge (posterior)",
};

/** Dinleme yeri: SPRSound p1/p3 → taraf; kaynakta seviye bilgisi yoktur (dürüstlük kuralı). */
const SPRSOUND_SITE_TR = {
  p1: "Sol bölge (posterior)",
  p3: "Sağ bölge (posterior)",
};

const DIAGNOSIS_TABLES = { "kauh-v3": KAUH_DIAGNOSIS_TR, sprsound: SPRSOUND_DIAGNOSIS_TR };

const MAX_AGE_YEARS = 120;

function normalized(value) {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

/** Tanı → Türkçe. Birleşik tanılar ("+", " and ") parça parça çevrilir. */
export function diagnosisToTurkish(datasetId, raw) {
  const text = normalized(raw);
  if (text === "" || text === "-") return null;
  const table = DIAGNOSIS_TABLES[datasetId];
  if (table === undefined) return text;
  const parts = text.split(/\s*(?:\+|(?:\band\b))\s*/giu).filter((part) => part !== "");
  return parts.map((part) => table[part.toLowerCase()] ?? part).join(" + ");
}

/** Dinleme yeri → Türkçe; eşlenmeyen kod ham haliyle korunur. */
export function siteToTurkish(datasetId, raw) {
  const text = normalized(raw);
  if (text === "") return null;
  if (datasetId === "kauh-v3") return KAUH_SITE_TR[text.replace(/\s+/gu, "").toUpperCase()] ?? text;
  if (datasetId === "sprsound") return SPRSOUND_SITE_TR[text.toLowerCase()] ?? text;
  return text;
}

/** Yaş alanı → yıl; geçersiz/aralık dışı değer null. */
export function ageYearsOf(raw) {
  const value = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(value) && value >= 0 && value <= MAX_AGE_YEARS ? value : null;
}

/** KAUH cinsiyet kodu ("F"/"M") → "F"/"M"; başka değer null. */
export function sexOfKauh(raw) {
  const text = normalized(raw).toUpperCase();
  return text === "F" || text === "M" ? text : null;
}

/** SPRSound cinsiyet kodu (plan: 0 = erkek, 1 = kadın) → "M"/"F"; başka değer null. */
export function sexOfSprsound(code) {
  const text = normalized(code);
  if (text === "0") return "M";
  if (text === "1") return "F";
  return null;
}

/** KAUH dosya adı alanları → `patient` alanı (origin: "real"). */
export function kauhPatientInfo(entry) {
  return {
    origin: "real",
    ageYears: ageYearsOf(entry.age),
    sex: sexOfKauh(entry.sex),
    diagnosis: diagnosisToTurkish("kauh-v3", entry.diagnosis),
    diagnosisSource: DIAGNOSIS_SOURCE["kauh-v3"],
    soundTypeRaw: normalized(entry.sound) || null,
    site: siteToTurkish("kauh-v3", entry.region),
  };
}

/** SPRSound dosya adı alanları + hasta özeti → `patient` alanı (origin: "real").
 *  Hasta özeti bulunamazsa tanı null kalır (uydurulmaz). */
export function sprsoundPatientInfo(fields, finding, summary) {
  const soundTypeRaw = finding === "rhonchi" ? "Rhonchi" : finding === "wheezing" ? "Wheeze" : null;
  return {
    origin: "real",
    ageYears: ageYearsOf(fields.age),
    sex: sexOfSprsound(fields.gender),
    diagnosis: diagnosisToTurkish("sprsound", summary?.disease ?? null),
    diagnosisSource: DIAGNOSIS_SOURCE.sprsound,
    soundTypeRaw,
    site: siteToTurkish("sprsound", fields.location),
  };
}

/** Hasta numarası karşılaştırması: baştaki sıfırlar ve boşluk kaldırılır. */
export function normalizePatientNo(value) {
  return String(value ?? "").trim().replace(/^0+(?=\d)/u, "");
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell);
  return cells;
}

/** `patient_num,disease` CSV'si → Map(hastaNo → hastalık). İlk kayıt geçerlidir. */
export function parsePatientSummaryCsv(csvText) {
  const rows = String(csvText).replace(/^\ufeff/u, "").split(/\r?\n/u).map(splitCsvLine);
  const header = (rows.shift() ?? []).map((column) => column.trim().toLowerCase());
  const patientIndex = header.indexOf("patient_num");
  const diseaseIndex = header.indexOf("disease");
  const summaries = new Map();
  if (patientIndex < 0 || diseaseIndex < 0) return summaries;
  for (const row of rows) {
    const patientNo = normalizePatientNo(row[patientIndex]);
    const disease = normalized(row[diseaseIndex]);
    if (patientNo === "" || disease === "" || summaries.has(patientNo)) continue;
    summaries.set(patientNo, disease);
  }
  return summaries;
}
