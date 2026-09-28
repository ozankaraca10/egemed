import type { OpacaPublicCase, SimCaseResult, SimPublicCase, SimSession, SimSessionMode } from "../../packages/contracts/src/index";
import type { SimSessionSource } from "../../packages/sim-host/src/SimHost";

/**
 * YALNIZ TEST: anahtarsız sunucu vakası ve sahte `SimSessionSource`. Sim paketi
 * testleri gerçek API'ye çıkmadan sunucu oturumu akışını (check/hint/answer/finish)
 * bu fixture ile sürer; jetonlar sabittir, ağ yoktur.
 */

export const SESSION_OPENED_AT = "2026-09-27T10:00:00.000+03:00";

export function publicCase(index = 1, overrides: Partial<OpacaPublicCase> = {}): OpacaPublicCase {
  return {
    simId: "opaca",
    index,
    label: `Vaka ${index}`,
    patient: { age: 52, sex: "erkek" },
    population: null,
    chiefComplaint: "Dispne",
    history: "2 gündür artan nefes darlığı.",
    vitalSigns: { hr: 96, rr: 22, spo2: 91 },
    tasks: ["Grafiyi sistematik (ABCDE) okuyun.", "Soruları yanıtlayın."],
    image: {
      token: `img-token-${index}`,
      width: 1024,
      height: 1024,
      modality: "XR",
      bodyPart: "toraks",
    },
    questions: [
      {
        id: "q1",
        type: "finding_identify",
        domain: "recognition",
        prompt: "Ana bulgu nedir?",
        multiple: false,
        hintAvailable: true,
        options: [
          { id: `opt-a-${index}000`, label: "Pnömotoraks" },
          { id: `opt-b-${index}000`, label: "Normal" },
        ],
      },
    ],
    technique: { requiredZoneCount: 5, systematicOrder: true },
    openedAt: SESSION_OPENED_AT,
    ...overrides,
  };
}

export function publicCaseWithStack(index = 2): OpacaPublicCase {
  return publicCase(index, {
    image: {
      token: `img-token-${index}`,
      width: 512,
      height: 512,
      modality: "CT",
      bodyPart: "toraks",
      stack: [
        { window: "lung", label: "Akciğer", frames: [`frame-a-${index}`, `frame-b-${index}`] },
        { window: "mediastinum", frames: [`frame-c-${index}`] },
      ],
    },
  });
}

export function caseResult(index = 1, overrides: Partial<SimCaseResult> = {}): SimCaseResult {
  return {
    index,
    title: `Gerçek Vaka Başlığı ${index}`,
    diagnosis: "Pnömotoraks",
    summary: "Sağ hemitoraksta pnömotoraks.",
    total: 80,
    max: 100,
    mastery: true,
    domains: {
      recognition: { earned: 25, max: 25 },
      localization: { earned: 20, max: 25 },
    },
    hintsUsed: 1,
    questions: [{ questionId: "q1", correct: true, correctOptionIds: [`opt-a-${index}000`], feedback: "Doğru; pnömotoraks." }],
    ...overrides,
  };
}

export interface FakeSessions extends SimSessionSource {
  readonly calls: string[];
  results: SimCaseResult[];
  finished: boolean;
}

export function fakeSessions(options: { readonly mode?: SimSessionMode; readonly caseCount?: number; readonly perCaseLimitMs?: number | null } = {}): FakeSessions {
  const mode = options.mode ?? "practice";
  const caseCount = options.caseCount ?? 2;
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const session: SimSession = {
    sessionId,
    mode,
    caseCount,
    perCaseLimitMs: options.perCaseLimitMs ?? (mode === "practice" ? null : 600_000),
    totalLimitMs: null,
    startedAt: SESSION_OPENED_AT,
  };
  const fake: FakeSessions = {
    calls: [],
    results: [],
    finished: false,
    async start(startMode) {
      fake.calls.push(`start:${startMode}`);
      return { ...session, mode: startMode };
    },
    async startChallenge(challengeId) {
      fake.calls.push(`startChallenge:${challengeId}`);
      return { ...session, mode: "challenge" };
    },
    async getCase(_sessionId, index) {
      fake.calls.push(`getCase:${index}`);
      return publicCase(index) as SimPublicCase;
    },
    async hint(_sessionId, index, questionId) {
      fake.calls.push(`hint:${index}:${questionId}`);
      return { hint: `İpucu ${questionId}`, hintsUsed: 1 };
    },
    async check(_sessionId, index, questionId) {
      fake.calls.push(`check:${index}:${questionId}`);
      return { questionId, correct: true, correctOptionIds: [`opt-a-${index}000`], feedback: "Doğru." };
    },
    async answer(_sessionId, index) {
      fake.calls.push(`answer:${index}`);
      if (mode === "practice") {
        const result = caseResult(index);
        fake.results.push(result);
        return { mode: "practice", result };
      }
      fake.results.push(caseResult(index, { total: 0, mastery: false, questions: [] }));
      return { mode: "assessment", accepted: true };
    },
    async finish() {
      fake.calls.push("finish");
      fake.finished = true;
      const results = fake.results.length ? fake.results : [caseResult(1)];
      const total = Math.round(results.reduce((sum, item) => sum + item.total, 0) / results.length);
      return { mode, total, max: 100, passed: total >= 80, cases: results, xpGained: 0 };
    },
    audioUrl: (_sessionId: string, token: string) => `/api/audio/${token}`,
    imageUrl: (id: string, token: string) => `/api/sims/opaca/sessions/${id}/image/${token}`,
  };
  return fake;
}
