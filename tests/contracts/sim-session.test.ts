import { describe, expect, it } from "vitest";
import {
  auscultaPublicCaseSchema,
  simSessionAnswerResponseSchema,
  simSessionFinishResponseSchema,
} from "../../packages/contracts/src/index";

// A1 (ADR-009): istemciye giden vaka anahtarsızdır; katı şema sızdırıcı alanları reddeder.

const BASE = {
  simId: "ausculta" as const,
  index: 1,
  label: "Vaka 1",
  patient: { age: 54, sex: "erkek" as const },
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
