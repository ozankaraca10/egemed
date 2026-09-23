/**
 * @egemed/xapi-profile v0 — profil sabitleri ve marka (brand) tipleri.
 *
 * Durum: Önerildi. İnsan xAPI profilini onaylar; "Kabul" durumuna yalnız
 * insan geçirir (docs/specs/E0-temel.md, T06 [KARAR]).
 */

/** Profil IRI'si; yer tutucu alan adı, insan kararı (research.md açık soru 1). */
export const PROFILE_IRI = "https://xapi.egemed.example/clix/v0" as const;

/** Desteklenen simülatörler; her ifade tam olarak birini taşır (ADR-003). */
export const SIMULATORS = ["pulse", "ausculta", "opaca"] as const;
export type SimulatorId = (typeof SIMULATORS)[number];

/**
 * ADL fiil kataloğu (xAPI 1.0.3); `display` tr-TR + en-US.
 * `terminated` v0'a öneriyle girer (research.md açık soru 2).
 */
export const VERBS = {
  initialized: {
    id: "http://adlnet.gov/expapi/verbs/initialized",
    display: { "tr-TR": "başlattı", "en-US": "initialized" },
  },
  experienced: {
    id: "http://adlnet.gov/expapi/verbs/experienced",
    display: { "tr-TR": "deneyimledi", "en-US": "experienced" },
  },
  answered: {
    id: "http://adlnet.gov/expapi/verbs/answered",
    display: { "tr-TR": "yanıtladı", "en-US": "answered" },
  },
  progressed: {
    id: "http://adlnet.gov/expapi/verbs/progressed",
    display: { "tr-TR": "ilerledi", "en-US": "progressed" },
  },
  completed: {
    id: "http://adlnet.gov/expapi/verbs/completed",
    display: { "tr-TR": "tamamladı", "en-US": "completed" },
  },
  passed: {
    id: "http://adlnet.gov/expapi/verbs/passed",
    display: { "tr-TR": "geçti", "en-US": "passed" },
  },
  failed: {
    id: "http://adlnet.gov/expapi/verbs/failed",
    display: { "tr-TR": "başarısız oldu", "en-US": "failed" },
  },
  terminated: {
    id: "http://adlnet.gov/expapi/verbs/terminated",
    display: { "tr-TR": "sonlandırdı", "en-US": "terminated" },
  },
} as const;
export type VerbKey = keyof typeof VERBS;
/** ADL fiil IRI'si; `http://adlnet.gov/expapi/verbs/${string}` alt kümesi. */
export type VerbIri = (typeof VERBS)[VerbKey]["id"];

/** ADL etkinlik tipleri (xAPI 1.0.3). */
export const ACTIVITY_TYPES = {
  simulation: "http://adlnet.gov/expapi/activities/simulation",
  module: "http://adlnet.gov/expapi/activities/module",
  interaction: "http://adlnet.gov/expapi/activities/interaction",
  assessment: "http://adlnet.gov/expapi/activities/assessment",
} as const;
export type ActivityTypeKey = keyof typeof ACTIVITY_TYPES;

/** Profil uzantı anahtarları; mutlak IRI, `PROFILE_IRI` altında. */
export const EXTENSIONS = {
  simulatorId: `${PROFILE_IRI}/extensions/simulator-id`,
} as const;

declare const brand: unique symbol;

/** Doğrulanmış activity IRI'si; yalnız `activityIri` üretir. */
export type ActivityIri = string & { readonly [brand]: "ActivityIri" };

/**
 * Opak kurum kimliği (ADR-005); ham string yerine geçmez, yalnız
 * `parseOpaqueActorId` üretir.
 */
export type OpaqueActorId = string & { readonly [brand]: "OpaqueActorId" };
