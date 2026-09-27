import { describe, expect, it } from "vitest";
import { opaca } from "../../packages/assessment-bank/src/index";
import { imageById } from "../../packages/assessment-bank/src/opaca/data";
import type { CaseDef } from "../../packages/assessment-bank/src/opaca/types";
import {
  auscultaPublicCaseSchema,
  opacaPublicCaseSchema,
  type OpacaPublicCase,
  type SimTelemetry,
} from "../../packages/contracts/src/index";
import { createDevLocalSessionSource } from "../../apps/shell/src/sims/devLocalSessions";
import { SERVER_SESSION_SIMS, createBrowserSessionSource } from "../../apps/shell/src/sims/sessionSources";

// A2.3 (ADR-009): Opaca sunucu oturumu için ortak altyapı. DEV yerel kaynağı
// bankanın (`@egemed/assessment-bank` `opaca`) anlamını taklit eder; üretim
// listesi (`SERVER_SESSION_SIMS`) bu görevde DEĞİŞMEZ (kanal T212b'de açılır).

const NOW = 1_728_000_000_000;
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "tok_ab12cd34";
const TELEMETRY: SimTelemetry = {
  visits: {},
  order: [],
  headChanges: 0,
  headUse: { bell: 0, diaphragm: 0 },
  replayCount: 0,
};

const ALL_OPACA_CASES: readonly CaseDef[] = [
  ...new Map([...opaca.poolFor("practice"), ...opaca.poolFor("assessment")].map((caseDef) => [caseDef.id, caseDef])).values(),
];

const labelsOf = (options: readonly { readonly label: string }[]): string => options.map((option) => option.label).sort().join("|");

/** Açık vakayı içerikten (başlık/görüntü yolu sızmaz) anahtarlı banka vakasına eşler. */
function caseOf(publicCase: OpacaPublicCase): CaseDef {
  const match = ALL_OPACA_CASES.filter(
    (caseDef) =>
      caseDef.chiefComplaint === publicCase.chiefComplaint &&
      caseDef.history === publicCase.history &&
      caseDef.questions.length === publicCase.questions.length &&
      caseDef.questions.every((question, position) => {
        const publicQuestion = publicCase.questions[position];
        return (
          publicQuestion !== undefined &&
          question.id === publicQuestion.id &&
          question.prompt === publicQuestion.prompt &&
          labelsOf(question.options) === labelsOf(publicQuestion.options)
        );
      }),
  );
  // Bankada içeriği birebir aynı vakalar olabilir (rastgele seçim); bu testlerde puanlama
  // içerik ve boş yanıt üzerinden yapıldığı için eşdeğerdirler — ilki alınır.
  expect(match.length).toBeGreaterThanOrEqual(1);
  return match[0]!;
}

/** İstemcinin gördüğü jetonları bankanın anahtar biçimine çevirir (test ayrıcalığı). */
function keysFor(publicCase: OpacaPublicCase, caseDef: CaseDef): opaca.OpacaCaseKeys {
  const options: Record<string, Record<string, string>> = {};
  for (const publicQuestion of publicCase.questions) {
    const question = caseDef.questions.find((candidate) => candidate.id === publicQuestion.id);
    const tokens: Record<string, string> = {};
    for (const option of publicQuestion.options) {
      const original = question?.options.find((candidate) => candidate.label === option.label);
      if (original !== undefined) tokens[option.id] = original.id;
    }
    options[publicQuestion.id] = tokens;
  }
  const runtimeUrl = imageById(caseDef.imageId)?.runtimeUrl ?? "";
  return { caseId: caseDef.id, imageId: caseDef.imageId, options, images: { [publicCase.image.token]: runtimeUrl } };
}

/** Doğru yanıt jetonları (lokalizasyonda hedefi bilmediğimiz için geçerli işaret). */
function answersFor(publicCase: OpacaPublicCase, caseDef: CaseDef, keys: opaca.OpacaCaseKeys): Record<string, string[]> {
  const answers: Record<string, string[]> = {};
  for (const publicQuestion of publicCase.questions) {
    const question = caseDef.questions.find((candidate) => candidate.id === publicQuestion.id);
    if (question === undefined || publicQuestion.options.length === 0) {
      answers[publicQuestion.id] = ["pt:0.5,0.5"];
      continue;
    }
    const map = keys.options[publicQuestion.id] ?? {};
    answers[publicQuestion.id] = question.correct.flatMap((optionId) => {
      const found = Object.keys(map).find((candidate) => map[candidate] === optionId);
      return found === undefined ? [] : [found];
    });
  }
  return answers;
}

describe("SERVER_SESSION_SIMS (A2.3)", () => {
  it("Opaca kanalı bu görevde kapalı kalır: liste yalnız Ausculta taşır", () => {
    expect(SERVER_SESSION_SIMS).toEqual(["ausculta"]);
  });
});

describe("createBrowserSessionSource", () => {
  it("görüntü jetonunu API vekil yoluna bağlar (istek yapmaz)", () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        document: { cookie: "egemed_csrf=abc" },
        fetch: () => Promise.reject(new Error("istek beklenmiyordu")),
      },
    });
    try {
      const source = createBrowserSessionSource("https://api.example.invalid", "opaca");
      expect(source).not.toBeNull();
      expect(source?.imageUrl(SESSION_ID, TOKEN)).toBe(
        `https://api.example.invalid/me/sims/opaca/sessions/${SESSION_ID}/image/${TOKEN}`,
      );
      expect(source?.audioUrl(SESSION_ID, TOKEN)).toBe(
        `https://api.example.invalid/me/sims/opaca/sessions/${SESSION_ID}/audio/${TOKEN}`,
      );
    } finally {
      if (previous === undefined) Reflect.deleteProperty(globalThis, "window");
      else Object.defineProperty(globalThis, "window", previous);
    }
  });
});

describe("createDevLocalSessionSource — Ausculta (mevcut davranış)", () => {
  it("başlat → vaka → ses adresi; görüntü adresi yoktur", async () => {
    const source = createDevLocalSessionSource("ausculta", () => NOW);
    const session = await source.start("practice");
    const publicCase = auscultaPublicCaseSchema.parse(await source.getCase(session.sessionId, 1));
    expect(publicCase.label).toBe("Vaka 1");
    const point = publicCase.points[0];
    const audioToken = point?.audio.diaphragm ?? point?.audio.bell;
    expect(audioToken).toBeDefined();
    expect(source.audioUrl(session.sessionId, audioToken ?? "")).toMatch(/^\/sims\/ausculta\/assets\/audio\/runtime\//);
    expect(source.imageUrl(session.sessionId, audioToken ?? "")).toBe("");
  });

  it("oturum kaynağı olmayan sim reddedilir", () => {
    expect(() => createDevLocalSessionSource("pulse", () => NOW)).toThrow(/Yerel oturum kaynağı/);
  });
});

describe("createDevLocalSessionSource — Opaca (A2.3)", () => {
  it("start → getCase sözleşmeye uyar; başlık, vaka kimliği ve görüntü yolu sızmaz", async () => {
    const source = createDevLocalSessionSource("opaca", () => NOW);
    const session = await source.start("practice");
    expect(session).toMatchObject({ mode: "practice", perCaseLimitMs: null, totalLimitMs: null });
    const publicCase = opacaPublicCaseSchema.parse(await source.getCase(session.sessionId, 1));
    expect(publicCase.simId).toBe("opaca");
    expect(publicCase.label).toBe("Vaka 1");
    const caseDef = caseOf(publicCase);
    const runtimeUrl = imageById(caseDef.imageId)?.runtimeUrl ?? "";
    const raw = JSON.stringify(publicCase);
    expect(raw).not.toContain(caseDef.title);
    expect(raw).not.toContain(caseDef.id);
    expect(raw).not.toContain(runtimeUrl);
    expect(raw).not.toContain('"correct"');
    expect(source.imageUrl(session.sessionId, publicCase.image.token)).toBe(`/sims/opaca/${runtimeUrl}`);
    // Sıralı açılış: ilk vaka yanıtlanmadan ikinci açılamaz.
    await expect(source.getCase(session.sessionId, 2)).rejects.toThrow("case_out_of_order");
  });

  it("check/answer/finish sonuçları bankanın checkQuestion/gradeCase'i ile birebir", async () => {
    const source = createDevLocalSessionSource("opaca", () => NOW);
    const session = await source.start("practice");
    const publicCase = opacaPublicCaseSchema.parse(await source.getCase(session.sessionId, 1));
    const caseDef = caseOf(publicCase);
    const keys = keysFor(publicCase, caseDef);
    const answers = answersFor(publicCase, caseDef, keys);
    let hintsUsed = 0;
    const hinted = publicCase.questions.find((question) => question.hintAvailable);
    if (hinted !== undefined) {
      const hint = await source.hint(session.sessionId, 1, hinted.id);
      hintsUsed = 1;
      expect(hint).toEqual({ hint: opaca.hintFor(caseDef, hinted.id), hintsUsed: 1 });
    }
    const first = publicCase.questions[0];
    if (first === undefined) throw new Error("soru yok");
    const firstAnswer = answers[first.id] ?? [];
    const checked = await source.check(session.sessionId, 1, first.id, firstAnswer);
    expect(checked).toEqual(opaca.checkQuestion(caseDef, keys, first.id, firstAnswer));
    await expect(source.check(session.sessionId, 1, first.id, firstAnswer)).rejects.toThrow("question_already_checked");
    const answered = await source.answer(session.sessionId, 1, { answers, telemetry: TELEMETRY });
    const expected = opaca.gradeCase(caseDef, keys, {
      index: 1,
      mode: "practice",
      answers,
      telemetry: TELEMETRY,
      hintsUsed,
    });
    expect(answered).toEqual({ mode: "practice", result: expected });
    const finished = await source.finish(session.sessionId);
    expect(finished).toEqual({
      mode: "practice",
      total: expected?.total,
      max: 100,
      passed: (expected?.total ?? 0) >= opaca.MASTERY_THRESHOLD,
      cases: [expected],
      xpGained: 0,
    });
  });

  it("değerlendirmede ipucu yasak; yanıt kabul, bitiş bankanın gradeCase'i ile aynı", async () => {
    const source = createDevLocalSessionSource("opaca", () => NOW);
    const session = await source.start("assessment");
    const publicCase = opacaPublicCaseSchema.parse(await source.getCase(session.sessionId, 1));
    expect(publicCase.questions.every((question) => !question.hintAvailable)).toBe(true);
    const first = publicCase.questions[0];
    if (first === undefined) throw new Error("soru yok");
    await expect(source.hint(session.sessionId, 1, first.id)).rejects.toThrow("forbidden");
    const answered = await source.answer(session.sessionId, 1, { answers: {}, telemetry: TELEMETRY });
    expect(answered).toEqual({ mode: "assessment", accepted: true });
    const caseDef = caseOf(publicCase);
    const expected = opaca.gradeCase(caseDef, keysFor(publicCase, caseDef), {
      index: 1,
      mode: "assessment",
      answers: {},
      telemetry: TELEMETRY,
      hintsUsed: 0,
    });
    const finished = await source.finish(session.sessionId);
    expect(finished).toEqual({
      mode: "assessment",
      total: expected?.total,
      max: 100,
      passed: (expected?.total ?? 0) >= opaca.MASTERY_THRESHOLD,
      cases: [expected],
      xpGained: 0,
    });
  });

  it("Meydan Okuma yerel kaynakta yoktur (sunucu ister)", async () => {
    const source = createDevLocalSessionSource("opaca", () => NOW);
    await expect(source.startChallenge(SESSION_ID)).rejects.toThrow("not_found");
  });
});
