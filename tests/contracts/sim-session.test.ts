import { describe, expect, it } from "vitest";
import {
  auscultaPublicCaseSchema,
  opacaPublicCaseSchema,
  pulsePublicCaseSchema,
  simSessionAnswerRequestSchema,
  simSessionAnswerResponseSchema,
  simSessionCaseResponseSchema,
  simSessionCheckRequestSchema,
  simSessionFinishResponseSchema,
  type SimPublicCase,
} from "../../packages/contracts/src/index";

// A1 (ADR-009): istemciye giden vaka anahtarsızdır; katı şema sızdırıcı alanları reddeder.

const BASE = {
  simId: "ausculta" as const,
  index: 1,
  label: "Vaka 1",
  patient: { age: 54, sex: "erkek" as const },
  population: null,
  chiefComplaint: "Nefes darlığı",
  history: "Öykü",
  vitalSigns: { hr: 88 },
  tasks: ["Uygun bölgeleri dinleyin."],
  views: ["front" as const],
  allowedHeads: ["bell" as const, "diaphragm" as const],
  points: [{ pointId: "cardiac_aortic", audio: { diaphragm: "tok_Abc12345" } }],
  questions: [
    {
      id: "q1",
      type: "sound_identify" as const,
      domain: "recognition" as const,
      prompt: "Duyduğunuz ses hangisidir?",
      multiple: false,
      hintAvailable: true,
      options: [
        { id: "opt_aaaaaaaa", label: "Normal kalp sesleri" },
        { id: "opt_bbbbbbbb", label: "S3" },
      ],
    },
  ],
  technique: { minPointsVisited: 3 },
  openedAt: "2026-09-27T10:00:00.000+03:00",
};

describe("anahtarsız vaka (PublicCase)", () => {
  it("geçerli anahtarsız vakayı kabul eder", () => {
    expect(auscultaPublicCaseSchema.safeParse(BASE).success).toBe(true);
  });

  it.each([
    ["title", { title: "Normal Kardiyak Oskültasyon" }],
    ["objectives", { objectives: ["Normal S1–S2 ritmini tanımak"] }],
    ["primaryAcousticFinding", { primaryAcousticFinding: "normal" }],
    ["clinicalDiagnosis", { clinicalDiagnosis: "Aort stenozu" }],
    ["soundAssignments", { soundAssignments: [] }],
  ])("sızdırıcı alan reddedilir: %s", (_name, extra) => {
    expect(auscultaPublicCaseSchema.safeParse({ ...BASE, ...extra }).success).toBe(false);
  });

  it("soruda doğru seçenek, ipucu ve geri bildirim taşınamaz", () => {
    const [question] = BASE.questions;
    for (const extra of [{ correct: ["opt_aaaaaaaa"] }, { hint: "Ritmi sayın" }, { feedbackCorrect: "Doğru" }]) {
      expect(auscultaPublicCaseSchema.safeParse({ ...BASE, questions: [{ ...question, ...extra }] }).success).toBe(false);
    }
  });

  it("ses noktası dosya adı ya da bulgu taşıyamaz; seçenek kimliği opak olmalı", () => {
    expect(auscultaPublicCaseSchema.safeParse({ ...BASE, points: [{ pointId: "cardiac_aortic", audio: { diaphragm: "tok_Abc12345" }, file: "normal.mp3" }] }).success).toBe(false);
    expect(auscultaPublicCaseSchema.safeParse({ ...BASE, points: [{ pointId: "cardiac_aortic", audio: { diaphragm: "normal.mp3" } }] }).success).toBe(false);
  });
});

// A2.1 (ADR-009): Opaca anahtarsız vakası görüntü kaynağını, bulguyu, kaliteyi,
// çözümleme metnini ve doğru seçenekleri taşıyamaz.
const OPACA_BASE = {
  simId: "opaca" as const,
  index: 2,
  label: "Vaka 2",
  patient: { age: 34, sex: "erkek" as const },
  population: null,
  chiefComplaint: "Öksürük",
  history: "Öykü",
  vitalSigns: { hr: 90 },
  tasks: ["Grafiyi sistematik (ABCDE) okuyun.", "Soruları yanıtlayın."],
  image: {
    token: "tok_Abc12345",
    width: 1024,
    height: 1024,
    modality: "XR" as const,
    bodyPart: "toraks" as const,
    readingZones: [{
      id: "a_trachea",
      step: "A" as const,
      label: "Trakea",
      fullLabel: "Trakea ve karina",
      detail: "Trakeayı değerlendirin.",
      rects: [{ x: 0.45, y: 0.05, w: 0.1, h: 0.3 }],
    }],
    noZonesReason: null,
  },
  questions: [
    {
      id: "q1",
      type: "finding_identify" as const,
      domain: "recognition" as const,
      prompt: "Grafideki ana bulgu hangisidir?",
      multiple: false,
      hintAvailable: false,
      options: [
        { id: "tok_aaaaaaaa", label: "Pnömotoraks" },
        { id: "tok_bbbbbbbb", label: "Plevral efüzyon" },
      ],
    },
  ],
  technique: { requiredZoneCount: 11, systematicOrder: true },
  openedAt: "2026-09-27T10:00:00.000+03:00",
};

describe("anahtarsız Opaca vakası", () => {
  it("geçerli anahtarsız vakayı kabul eder", () => {
    expect(opacaPublicCaseSchema.safeParse(OPACA_BASE).success).toBe(true);
  });

  it("lokalizasyon sorusu seçeneksiz olabilir; CT yığını jetonlarla taşınır", () => {
    const localization = {
      id: "q2",
      type: "localization" as const,
      domain: "localization" as const,
      prompt: "Bulgunun yerini işaretleyin.",
      multiple: false,
      hintAvailable: false,
      options: [],
    };
    const ct = {
      ...OPACA_BASE,
      image: {
        ...OPACA_BASE.image,
        modality: "CT" as const,
        stack: [{ window: "lung" as const, label: "Akciğer penceresi", frames: ["tok_cccccccc"] }],
      },
      questions: [...OPACA_BASE.questions, localization],
    };
    expect(opacaPublicCaseSchema.safeParse(ct).success).toBe(true);
  });

  it.each([
    ["title", { title: "Kardiyomegali" }],
    ["objectives", { objectives: ["Kardiyomegaliyi tanır."] }],
    ["primaryFinding", { primaryFinding: "cardiomegaly" }],
    ["clinicalDiagnosis", { clinicalDiagnosis: "Kalp yetmezliği" }],
    ["mappingNote", { mappingNote: "eğitim eşlemesi" }],
  ])("sızdırıcı alan reddedilir: %s", (_name, extra) => {
    expect(opacaPublicCaseSchema.safeParse({ ...OPACA_BASE, ...extra }).success).toBe(false);
  });

  it("görüntü kaynak dosya, bulgu, kalite ve çözümleme alanı taşıyamaz", () => {
    for (const extra of [
      { viewPosition: "PA" },
      { sourceFile: "img.png" },
      { sourceDataset: "nih-cxr14" },
      { findings: { cardiomegaly: "expert_bbox" } },
      { negatives: {} },
      { annotations: [] },
      { quality: null },
      { runtimeUrl: "assets/xray/runtime/img.webp" },
      { readingText: "okuma" },
      { license: null },
      { id: "commons_x" },
    ]) {
      expect(opacaPublicCaseSchema.safeParse({ ...OPACA_BASE, image: { ...OPACA_BASE.image, ...extra } }).success).toBe(false);
    }
  });

  it("soruda doğru seçenek, ipucu, geri bildirim ve lokalizasyon hedefi taşınamaz", () => {
    const [question] = OPACA_BASE.questions;
    for (const extra of [
      { correct: ["tok_aaaaaaaa"] },
      { hint: "Kalp gölgesine bakın" },
      { feedbackCorrect: "Doğru" },
      { targetFinding: "cardiomegaly" },
      { generic: true },
    ]) {
      expect(opacaPublicCaseSchema.safeParse({ ...OPACA_BASE, questions: [{ ...question, ...extra }] }).success).toBe(false);
    }
  });

  it("yanıt zarfı anahtarsız gövdeyi doğrular ve sızdırıcı alanı reddeder", () => {
    expect(simSessionCaseResponseSchema.safeParse({ data: BASE }).success).toBe(true);
    expect(simSessionCaseResponseSchema.safeParse({ data: OPACA_BASE }).success).toBe(true);
    expect(simSessionCaseResponseSchema.safeParse({ data: { ...OPACA_BASE, simId: "pulse" } }).success).toBe(false);
    expect(simSessionCaseResponseSchema.safeParse({ data: { ...OPACA_BASE, title: "sızıntı" } }).success).toBe(false);
  });

  it("SimPublicCase birleşimi iki sim gövdesini taşır, üçüncüsünü reddeder (tip testi)", () => {
    const auscultaCase: SimPublicCase = BASE;
    const opacaCase: SimPublicCase = OPACA_BASE;
    expect([auscultaCase.simId, opacaCase.simId]).toEqual(["ausculta", "opaca"]);
    // @ts-expect-error pulse gövdesi birleşimde yok
    const pulseCase: SimPublicCase = { ...BASE, simId: "pulse" };
    expect(pulseCase).toBeDefined();
  });
});

// A3.1 (ADR-009): Pulse anahtarsız vakası doğru seçeneği, gerekçeleri, geri
// bildirimi ve madde kimliğini taşıyamaz. `ecg.mode` bilinçli kabul edilen
// sınırdır (istemci EKG'yi moddan üretir; A3.3 değerlendirecek).
const PULSE_BASE = {
  simId: "pulse" as const,
  index: 1,
  label: "Vaka 1",
  section: "case" as const,
  stem: "42 yaşında erkek hasta. Başvuru: çarpıntı.",
  question: "Bu bulgularla en uyumlu örüntü hangisidir?",
  vitals: [
    { label: "Nabız", value: "142/dk düzensiz" },
    { label: "TA", value: "110/72 mmHg" },
  ],
  options: [
    { id: "tok_aaaaaaaa", label: "Atriyal fibrilasyon" },
    { id: "tok_bbbbbbbb", label: "Sinüs taşikardisi" },
    { id: "tok_cccccccc", label: "Atriyal flutter" },
    { id: "tok_dddddddd", label: "Fokal atriyal taşikardi" },
    { id: "tok_eeeeeeee", label: "Ventriküler erken atım" },
  ],
  ecg: { mode: "af" as const, options: { afProfile: "rapid" }, leads: ["II" as const, "aVF" as const, "V1" as const], start: 0.58, seconds: 3.2 },
  openedAt: "2026-09-27T10:00:00.000+03:00",
};

describe("anahtarsız Pulse vakası", () => {
  it("geçerli anahtarsız vakayı kabul eder", () => {
    expect(pulsePublicCaseSchema.safeParse(PULSE_BASE).success).toBe(true);
  });

  it.each([
    ["title", { title: "Sentetik vaka C001" }],
    ["correct", { correct: 0 }],
    ["explanations", { explanations: ["P yok."] }],
    ["feedback", { feedback: "P yok ve R–R düzensiz." }],
    ["objectiveIds", { objectiveIds: ["O2"] }],
    ["sourceIds", { sourceIds: ["AF2024"] }],
    ["decisionId", { decisionId: "af" }],
    ["note", { note: "retrospektif" }],
    ["vitals (k/v biçimi)", { vitals: [{ k: "Nabız", v: "142" }] }],
  ])("sızdırıcı alan reddedilir: %s", (_name, extra) => {
    expect(pulsePublicCaseSchema.safeParse({ ...PULSE_BASE, ...extra }).success).toBe(false);
  });

  it("seçenekler tam 5 ve opak olmalı; EKG modu motor listesiyle sınırlıdır", () => {
    expect(pulsePublicCaseSchema.safeParse({ ...PULSE_BASE, options: PULSE_BASE.options.slice(0, 4) }).success).toBe(false);
    expect(
      pulsePublicCaseSchema.safeParse({ ...PULSE_BASE, options: [{ id: "correct", label: "AF" }, ...PULSE_BASE.options.slice(1)] }).success,
    ).toBe(false);
    expect(pulsePublicCaseSchema.safeParse({ ...PULSE_BASE, ecg: { ...PULSE_BASE.ecg, mode: "unknown" } }).success).toBe(false);
    expect(pulsePublicCaseSchema.safeParse({ ...PULSE_BASE, ecg: { ...PULSE_BASE.ecg, leads: ["II", "aVF"] } }).success).toBe(false);
  });

  it("yanıt zarfı üç simin de anahtarsız gövdesini doğrular", () => {
    expect(simSessionCaseResponseSchema.safeParse({ data: PULSE_BASE }).success).toBe(true);
    expect(simSessionCaseResponseSchema.safeParse({ data: { ...PULSE_BASE, feedback: "sızıntı" } }).success).toBe(false);
    expect(simSessionCaseResponseSchema.safeParse({ data: { ...PULSE_BASE, simId: "ausculta" } }).success).toBe(false);
  });
});

describe("lokalizasyon işareti (pt:)", () => {
  const TELEMETRY = {
    visits: {},
    order: [],
    headChanges: 0,
    headUse: { bell: 0, diaphragm: 0 },
    replayCount: 0,
  };

  it("check ve answer istekleri pt: işaretini kabul eder; bozuk işareti reddeder", () => {
    expect(simSessionCheckRequestSchema.safeParse({ questionId: "q2", answer: ["pt:0.1234,0.5678"] }).success).toBe(true);
    expect(simSessionAnswerRequestSchema.safeParse({ answers: { q2: ["pt:0,1"] }, telemetry: TELEMETRY }).success).toBe(true);
    for (const bad of ["pt:1.5,0.5", "pt:0.12345,0.5", "pt:0.5", "0.5,0.5"]) {
      expect(simSessionCheckRequestSchema.safeParse({ questionId: "q2", answer: [bad] }).success).toBe(false);
    }
  });
});

describe("yanıt ve bitiş", () => {
  it("değerlendirme yanıtı geri bildirim taşımaz; yalnız kabul", () => {
    expect(simSessionAnswerResponseSchema.safeParse({ data: { mode: "assessment", accepted: true } }).success).toBe(true);
    expect(
      simSessionAnswerResponseSchema.safeParse({ data: { mode: "assessment", accepted: true, result: {} } }).success,
    ).toBe(false);
  });

  it("bitiş yanıtı sunucu denemesini ve XP'yi taşır", () => {
    const parsed = simSessionFinishResponseSchema.safeParse({
      data: {
        mode: "assessment",
        total: 80,
        max: 100,
        passed: true,
        cases: [],
        attemptId: "00000000-0000-4000-8000-000000000099",
        xpGained: 120,
      },
    });
    expect(parsed.success).toBe(true);
  });
});
