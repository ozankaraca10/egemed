import type { SoundAssignment, SoundRecord, SoundsManifest } from "./types";
import { externalManifest, soundsManifest } from "./data";

/** Kayıt çözümleyici (§2 konum-duyarlı ses, §14). Ses atamalarını deterministik olarak
 *  sounds.json kayıtlarına eşler. Varsayılan sıralama: kaynak konum eşleşmesi > cinsiyet "any" > id. */

export const manifest = soundsManifest as unknown as SoundsManifest;
/** Birincil (HLS-CMDS) + envanter kayıtları (CirCor — pediatrik, ODC-BY 1.0; KAUH v3 — gerçek hasta
 *  posterior, CC BY 4.0; SPRSound — pediatrik posterior, CC BY 4.0). CirCor ve SPRSound kayıtları
 *  yalnızca açıkça soundId ile hedeflenir; KAUH posterior kayıtları ise simulationLocation
 *  eşleşmesiyle (nokta bazlı) devreye girer. */
export const RECORDS: SoundRecord[] = [
  ...manifest.records,
  ...((externalManifest as unknown as { records?: SoundRecord[] }).records ?? []),
];
export const EXTERNAL_RECORDS: SoundRecord[] = RECORDS.filter((r) => r.sourceDataset !== "hls-cmds-v3");

const byId = new Map(RECORDS.map((r) => [r.id, r]));

export function getSound(id: string): SoundRecord | undefined {
  return byId.get(id);
}

const POSTERIOR_TO_ANTERIOR: Record<string, string> = {
  lung_right_upper_posterior: "lung_right_upper_anterior",
  lung_left_upper_posterior: "lung_left_upper_anterior",
  lung_right_middle_posterior: "lung_right_middle_anterior",
  lung_left_middle_posterior: "lung_left_middle_anterior",
  lung_right_lower_posterior: "lung_right_lower_anterior",
  lung_left_lower_posterior: "lung_left_lower_anterior",
};

/** Otomatik (soundId'siz) konum eşleşmesine açık veri setleri: paket içi HLS-CMDS ile gerçek
 *  hastadan bölge etiketli KAUH posterior kayıtları. CirCor ve SPRSound yalnızca açıkça
 *  soundId ile hedeflenir; pediatrik SPRSound kayıtları yetişkin vakalara ASLA sızmaz (T234). */
const AUTO_MATCH_DATASETS = new Set(["hls-cmds-v3", "kauh-v3"]);

export function resolveAssignment(a: SoundAssignment): SoundRecord | null {
  if (a.soundId) return byId.get(a.soundId) ?? null;
  const matches = RECORDS.filter(
    (r) =>
      r.category === a.category &&
      r.acousticFinding === a.acousticFinding &&
      r.validationStatus === "validated" &&
      AUTO_MATCH_DATASETS.has(r.sourceDataset) &&
      // dürüst eşleme (§13): RC/LC gibi net olmayan kayıt konumları adlandırılmış
      // odak noktasına sunulmaz — sim konumu uyuşmalı ya da kayıt eşlemesiz olmalı
      (!a.pointId || r.simulationLocation === a.pointId) &&
      (!a.recordedLocation || r.recordedLocation === a.recordedLocation) &&
      (!a.gender || a.gender === "any" || r.gender === a.gender),
  );
  // deterministik: dosya adına göre sabit sıralama
  matches.sort((x, y) => x.sourceFile.localeCompare(y.sourceFile));
  return matches[0] ?? null;
}

/** Karma atamanın akciğer bileşeni: "kalp+akciğer" bulgusunun ikinci parçası; yoksa null.
 *  Sırtta kalp sesleri zayıf duyulur — posterior çözümleme yalnız akciğer bileşenini arar (§14). */
function lungComponentFinding(a: SoundAssignment): string | null {
  if (a.category !== "mixed" || a.soundId !== undefined) return null;
  const parts = a.acousticFinding.split("+");
  const part = parts.length > 1 ? (parts[1] ?? "").trim() : "";
  return part.length > 0 ? part : null;
}

/** Posterior noktaya atama yapıldığında, doğrulanmış posterior kayıt yoksa aynı bulgunun
 *  anterior kaydına düşer ve kaynak bölge `fallbackFrom` ile bildirilir (§14 dürüstlük kuralı).
 *  Karma atamada (ör. "s3+wheezing") posterior noktada önce akciğer bileşeninin gerçek kaydı
 *  aranır; bulunursa kayıt bileşen kaydıdır (`lungComponentOf`), anterior fallback uygulanmaz. */
export function resolveAssignmentEx(a: SoundAssignment): {
  record: SoundRecord | null;
  fallbackFrom?: string;
  /** Karma atama, posterior noktada akciğer bileşeninin gerçek kaydıyla çözüldüyse "mixed". */
  lungComponentOf?: "mixed";
} {
  const strict = resolveAssignment(a);
  if (strict) return { record: strict };
  const source = a.pointId ? POSTERIOR_TO_ANTERIOR[a.pointId] : undefined;
  if (source) {
    const lungPart = lungComponentFinding(a);
    if (lungPart !== null) {
      const lung = resolveAssignment({ pointId: a.pointId, category: "lung", acousticFinding: lungPart });
      if (lung) return { record: lung, lungComponentOf: "mixed" };
    }
    const rec = resolveAssignment({ ...a, pointId: source });
    if (rec) return { record: rec, fallbackFrom: source };
  }
  return { record: null };
}

export interface CaseSoundsResolution {
  sounds: Record<string, SoundRecord | null>;
  /** pointId → kaydın gerçekten alındığı bölge (fallback durumunda dolu) */
  fallbacks: Record<string, string>;
  /** pointId → "lung": karma atama, o posterior noktada akciğer bileşeninin gerçek kaydıyla çözüldü */
  components: Record<string, "lung">;
}

/** Vaka ses haritası + fallback/bileşen bilgisi (posterior noktalar dahil). */
export function resolveCaseSoundsEx(assignments: SoundAssignment[]): CaseSoundsResolution {
  const sounds: Record<string, SoundRecord | null> = {};
  const fallbacks: Record<string, string> = {};
  const components: Record<string, "lung"> = {};
  for (const a of assignments) {
    const res = resolveAssignmentEx(a);
    sounds[a.pointId] = res.record;
    if (res.fallbackFrom) fallbacks[a.pointId] = res.fallbackFrom;
    if (res.lungComponentOf) components[a.pointId] = "lung";
  }
  return { sounds, fallbacks, components };
}

/** Bir vaka için pointId → kayıt haritasını çözer. Eksikler `{pointId: null}`. */
export function resolveCaseSounds(assignments: SoundAssignment[]): Record<string, SoundRecord | null> {
  const out: Record<string, SoundRecord | null> = {};
  for (const a of assignments) out[a.pointId] = resolveAssignment(a);
  return out;
}

/** Kütüphanede konum eşleşmesiyle yer alabilen veri setleri: paket içi HLS-CMDS ve gerçek
 *  hastadan bölge etiketli posterior kayıtlar (KAUH v3). CirCor yalnız soundId ile hedeflenir. */
const LIBRARY_LOCATION_DATASETS = new Set(["hls-cmds-v3", "kauh-v3"]);

/** Öğrenme kütüphanesi sesi: kategori + akustik bulgu + tercihen odak noktası konumu. */
export function resolveLibrarySound(category: string, finding: string, simLocation?: string): SoundRecord | null {
  const pool = RECORDS.filter(
    (r) =>
      r.category === category &&
      r.acousticFinding === finding &&
      r.validationStatus === "validated" &&
      LIBRARY_LOCATION_DATASETS.has(r.sourceDataset),
  );
  if (simLocation) {
    const loc = pool.filter((r) => r.simulationLocation === simLocation);
    if (loc.length) {
      loc.sort((x, y) => x.sourceFile.localeCompare(y.sourceFile));
      return loc[0] ?? null;
    }
  }
  pool.sort((x, y) => x.sourceFile.localeCompare(y.sourceFile));
  return pool[0] ?? null;
}

export interface LibrarySoundResult {
  record: SoundRecord | null;
  /** Kayıt, istenen bölgede değil başka bir bölgeden alınmışsa kaynak bölge id'si */
  fallbackFrom?: string;
  /** Karma kitaplık sesi, posterior noktada akciğer bileşeninin gerçek kaydıyla çözüldüyse "mixed" */
  lungComponentOf?: "mixed";
}

/** Kütüphane sesi + dürüstlük bilgisi (§14): posterior bölge için kayıt yoksa,
 *  aynı bulgunun anterior kaydı 'fallback' olarak sunulur ve kaynak bölge bildirilir.
 *  Karma bulguda posterior noktada önce akciğer bileşeninin gerçek kaydı aranır. */
export function resolveLibrarySoundEx(category: string, finding: string, simLocation?: string): LibrarySoundResult {
  const direct = simLocation ? resolveLibrarySound(category, finding, simLocation) : resolveLibrarySound(category, finding);
  if (direct && (!simLocation || direct.simulationLocation === simLocation)) {
    return { record: direct };
  }
  const source = simLocation ? POSTERIOR_TO_ANTERIOR[simLocation] : undefined;
  if (source) {
    const parts = finding.split("+");
    const lungPart = category === "mixed" && parts.length > 1 ? (parts[1] ?? "").trim() : "";
    if (lungPart.length > 0) {
      const lung = resolveLibrarySound("lung", lungPart, simLocation);
      if (lung && lung.simulationLocation === simLocation) return { record: lung, lungComponentOf: "mixed" };
    }
    const rec = resolveLibrarySound(category, finding, source);
    if (rec) return { record: rec, fallbackFrom: source };
  }
  return { record: direct ?? null };
}

/** Sınıf başına mevcut (doğrulanmış) kayıt sayısı — UI "yok" gösterimi için. */
export function availableCount(category: string, finding: string): number {
  return RECORDS.filter((r) => r.category === category && r.acousticFinding === finding && r.validationStatus === "validated")
    .length;
}

/** O7: değerlendirmede bildirimsiz posterior/fallback sunumu önlenir — kaydı gerçekten o
 *  bölgeden alınmamış (fallbackFrom ile bildirilen) noktalar değerlendirmede sunulmaz.
 *  Akciğer bileşeniyle çözülen posterior noktalar gerçek kayıt sayılır, dışlanmaz.
 *  Öğrenme/uygulamada not-şeridiyle açıkça bildirilen aynı noktalar buradan etkilenmez. */
export function assessmentPointFilter(assignments: SoundAssignment[]): string[] {
  const { fallbacks } = resolveCaseSoundsEx(assignments);
  return assignments.map((a) => a.pointId).filter((id) => !fallbacks[id]);
}

/** Değerlendirme havuzu: yalnızca validated eşlemeli ve 'assessment' modlu vakalar (§19). */
export function assessmentPool(cases: { modes: string[]; mappingValidation: string; clinicalDiagnosis: unknown }[]) {
  return cases.filter((c) => c.modes.includes("assessment") && c.mappingValidation === "validated");
}
