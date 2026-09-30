/**
 * T259 — Öğrenme modu örnek listesi: her kütüphane konusu için en fazla 5 sıralı ses
 * kimliği. Kurallar (plan): gerçek hasta kayıtları önce; farklı hastalar; mümkünse
 * erişkin (KAUH) + çocuk (SPRSound) karışık; konunun gerçek kaydı yoksa mevcut
 * manken (HLS-CMDS) kaydı kalır. Seçim tamamen deterministiktir: veri kümesi sırası
 * sabit, kova içi sıralama kimliğe göre; hasta tekrarı iç hasta anahtarıyla elenir.
 */

export const MAX_SAMPLES = 5;
/** Gerçek hasta veri kümeleri, seçim sırası: erişkin → çocuk → diğer. */
export const REAL_DATASET_ORDER = ["kauh-v3", "sprsound", "physionet-circor"];
const MANIKIN_DATASET = "hls-cmds-v3";

/** Hasta anahtarı: özel alan varsa o, yoksa iç kaynak kimliği (KAUH/CirCor hasta no
 *  içerir), yoksa kayıt kimliği. Yalnız seçim içinde kullanılır, gösterilmez. */
export function patientKeyOf(record) {
  return record.internalPatientId ?? record.internalSourceId ?? record.id;
}

/** Anormal bulgu konusunda "kontrol grubu" etiketli gerçek hasta öğretici değildir
 *  (ör. ronküs duyulan kayıtta "hastalık yok" yazması öğrenciyi yanıltır). */
function teachable(topic, record) {
  return topic.acousticFinding === "normal" || !/^Kontrol grubu/.test(record.patient?.diagnosis ?? "");
}

function poolOf(topic, records) {
  return records.filter(
    (record) =>
      record.category === topic.category &&
      record.acousticFinding === topic.acousticFinding &&
      record.validationStatus === "validated" &&
      teachable(topic, record),
  );
}

/** Veri kümesi grubu: hasta tekrarı elenir; kova içi sıra kimliğe göre deterministik. */
function realGroups(pool) {
  const groups = [];
  for (const dataset of REAL_DATASET_ORDER) {
    const seen = new Set();
    const list = pool
      .filter((record) => record.sourceDataset === dataset)
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((record) => {
        const key = patientKeyOf(record);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (list.length > 0) groups.push(list);
  }
  return groups;
}

/** Konu için sıralı örnek kimlikleri: gerçekler eşit turda dönüşümlü (erişkin/çocuk
 *  karışık), kalan yerler manken kayıtlarıyla doldurulur; en fazla `max` örnek. */
export function selectTopicSamples(topic, records, max = MAX_SAMPLES) {
  const pool = poolOf(topic, records);
  const chosen = [];
  const groups = realGroups(pool);
  let cursor = 0;
  while (chosen.length < max && groups.some((group) => group.length > 0)) {
    const group = groups[cursor % groups.length];
    cursor += 1;
    if (group === undefined || group.length === 0) continue;
    chosen.push(group.shift());
  }
  for (const record of pool
    .filter((record) => record.sourceDataset === MANIKIN_DATASET)
    .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile))) {
    if (chosen.length >= max) break;
    chosen.push(record);
  }
  return chosen.map((record) => record.id);
}

/** Tüm kütüphane konuları → örnek listesi dosyası (deterministik anahtar sırası). */
export function buildLearningSamples(topics, records) {
  const samples = {};
  for (const topic of topics) samples[topic.key] = selectTopicSamples(topic, records);
  return { version: 1, topics: samples };
}
