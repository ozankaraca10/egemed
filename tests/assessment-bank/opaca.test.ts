import ts from "typescript";
import { describe, expect, it } from "vitest";
import { caseResultSchema, opacaPublicCaseSchema } from "../../packages/contracts/src/index";
import { opaca } from "../../packages/assessment-bank/src/index";
import { nearestFindingBoxCenter } from "../../packages/assessment-bank/src/opaca/geometry";
import { getImage } from "../../packages/sim-opaca/src/core/images";
import { encodeMark } from "../../packages/sim-opaca/src/core/geometry";
import { scoreCase as simScoreCase } from "../../packages/sim-opaca/src/core/scoring";
import type { CaseResult as ClientCaseResult } from "../../packages/sim-opaca/src/core/types";
import { ZONES as SIM_ZONES } from "../../packages/sim-opaca/src/data/zones";
import { buildAttemptRecord } from "../../packages/sim-opaca/src/gamification/attempt";
import { TOPIC_BADGE_MATCH } from "../../packages/sim-opaca/src/gamification/stats";
import { FINDINGS } from "../../packages/sim-opaca/src/data/terminology";
import { OPACA_TOPIC_MATCH, opacaSessionStats } from "../../packages/assessment-bank/src/opaca/stats";
import type { CaseDef, ImageRecord, Question } from "../../packages/assessment-bank/src/opaca/types";

// A2.1 (ADR-009): anahtarsız Opaca projeksiyonu hiçbir vakada anahtar/tanı/görüntü
// yolu sızdırmaz; sunucu notlandırması sim ile birebir aynı puanı üretir.

let counter = 0;
const newToken = () => `tok_${(counter++).toString(36).padStart(10, "0")}`;
const random = () => 0.42;
const OPENED_AT = "2026-09-27T10:00:00.000+03:00";
const EMPTY_TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };
const TOOL_USE = { zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 };

const allCases: readonly CaseDef[] = [
  ...new Map([...opaca.poolFor("practice"), ...opaca.poolFor("assessment")].map((c) => [c.id, c])).values(),
];

function imageFor(caseDef: CaseDef): ImageRecord {
  const image = getImage(caseDef.imageId);
  if (image === undefined) throw new Error(`görüntü yok: ${caseDef.imageId}`);
  return image;
}

function tokenFor(keys: opaca.OpacaCaseKeys, qid: string, optionId: string): string {
  const map = keys.options[qid] ?? {};
  const token = Object.keys(map).find((key) => map[key] === optionId);
  if (token === undefined) throw new Error(`jeton yok: ${qid}/${optionId}`);
  return token;
}

function localizationPairs(): readonly { readonly caseDef: CaseDef; readonly question: Question }[] {
  return allCases.flatMap((caseDef) =>
    caseDef.questions.filter((q) => q.type === "localization").map((question) => ({ caseDef, question })),
  );
}

/** Anahtarlı doğru yanıt (lokalizasyonda hedef kutunun merkezine işaret). */
function realAnswer(caseDef: CaseDef, question: Question): string[] {
  if (question.type !== "localization") return [...question.correct];
  const center = nearestFindingBoxCenter({ x: 0, y: 0 }, imageFor(caseDef), question.targetFinding ?? "");
  return center === null ? [] : [encodeMark(center)];
}

describe("anahtarsız projeksiyon — sızıntı taraması", () => {
  it("havuzlar dolu (uygulama ≥ değerlendirme)", () => {
    expect(opaca.poolFor("practice").length).toBeGreaterThan(100);
    expect(opaca.poolFor("assessment").length).toBeGreaterThan(50);
  });

  for (const mode of ["practice", "assessment"] as const) {
    it(`${mode}: 20 vakada sözleşmeye uyar ve anahtar sızdırmaz`, () => {
      const stride = Math.max(1, Math.floor(allCases.length / 20));
      const sample = allCases.filter((_, index) => index % stride === 0).slice(0, 20);
      expect(sample).toHaveLength(20);
      for (const caseDef of sample) {
        const image = imageFor(caseDef);
        const { publicCase, keys } = opaca.buildPublicCase(caseDef, { index: 1, mode, openedAt: OPENED_AT, newToken, random });
        const parsed = opacaPublicCaseSchema.safeParse(publicCase);
        expect(parsed.success, `${caseDef.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe(true);
        const json = JSON.stringify(publicCase);
        expect(json, caseDef.id).not.toContain(JSON.stringify(caseDef.title));
        expect(json, caseDef.id).not.toContain(JSON.stringify(caseDef.primaryFinding));
        if (caseDef.clinicalDiagnosis !== null) expect(json, caseDef.id).not.toContain(JSON.stringify(caseDef.clinicalDiagnosis));
        expect(json, caseDef.id).not.toContain(JSON.stringify(image.id));
        expect(json, caseDef.id).not.toContain(JSON.stringify(image.runtimeUrl));
        expect(json, caseDef.id).not.toContain(JSON.stringify(image.sourceFile));
        // Anahtarlı alan adları ve dosya uzantıları hiçbir yerde geçmez.
        expect(json, caseDef.id).not.toMatch(/"correct"|feedbackCorrect|feedbackIncorrect|targetFinding|primaryFinding|clinicalDiagnosis|objectives|mappingNote|libraryKey|viewPosition|sourceFile|runtimeUrl|\.webp|\.jpg|assets\//);
        for (const objective of caseDef.objectives) expect(json, caseDef.id).not.toContain(JSON.stringify(objective));
        expect(json, caseDef.id).not.toContain(JSON.stringify(caseDef.feedback.summary));
        // Görüntü projeksiyonu soru metinlerinde meşru geçebilir (film_quality); yalnız
        // soru dışı alanlarda sızmadığı doğrulanır.
        const withoutQuestions = JSON.stringify({
          ...publicCase,
          questions: publicCase.questions.map((q) => ({ id: q.id, type: q.type, domain: q.domain })),
        });
        expect(withoutQuestions, caseDef.id).not.toContain(JSON.stringify(image.viewPosition));
        for (const q of caseDef.questions) {
          expect(json, `${caseDef.id}/${q.id}`).not.toContain(JSON.stringify(q.feedbackCorrect));
          if (q.hint !== undefined && q.hint !== q.help) expect(json, `${caseDef.id}/${q.id}`).not.toContain(JSON.stringify(q.hint));
          if (q.targetFinding !== undefined) expect(json, `${caseDef.id}/${q.id}`).not.toContain(JSON.stringify(q.targetFinding));
          // Gerçek seçenek kimlikleri (a, b, c…) gitmez; yalnız opak jeton.
          for (const option of publicCase.questions.find((pq) => pq.id === q.id)?.options ?? []) {
            expect(option.id.startsWith("tok_")).toBe(true);
            expect((keys.options[q.id] ?? {})[option.id]).toBeDefined();
          }
        }
      }
    });
  }

  it("değerlendirmede ipucu yok; uygulamada ipucu olan sorular işaretli", () => {
    const withHint = allCases.find((c) => c.questions.some((q) => (q.hint ?? "").length > 0));
    expect(withHint).toBeDefined();
    if (withHint === undefined) return;
    const assess = opaca.buildPublicCase(withHint, { index: 1, mode: "assessment", openedAt: OPENED_AT, newToken, random });
    const practice = opaca.buildPublicCase(withHint, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    expect(assess.publicCase.questions.every((q) => !q.hintAvailable)).toBe(true);
    expect(practice.publicCase.questions.some((q) => q.hintAvailable)).toBe(true);
  });

  it("vaka görevleri geneldir; objectives gönderilmez", () => {
    const caseDef = allCases[0];
    if (caseDef === undefined) throw new Error("vaka yok");
    const { publicCase } = opaca.buildPublicCase(caseDef, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    expect(publicCase.tasks).toEqual(["Grafiyi sistematik (ABCDE) okuyun.", "Soruları yanıtlayın."]);
    for (const objective of caseDef.objectives) expect(publicCase.tasks).not.toContain(objective);
  });
});

describe("sunucu notlandırması", () => {
  const caseDef = allCases.find((c) => c.questions.length >= 2 && c.mappingValidation === "validated" && c.questions.every((q) => q.type !== "localization"));
  if (caseDef === undefined) throw new Error("uygun vaka yok");

  it("gradeCase toplamı ve alanları sim-opaca scoreCase ile birebir aynı", () => {
    const { publicCase, keys } = opaca.buildPublicCase(caseDef, { index: 2, mode: "practice", openedAt: OPENED_AT, newToken, random });
    // Anahtarlı gerçek yanıtlar; istemci jetonlarla gönderir (gradeCase çözer).
    const decoded = Object.fromEntries(caseDef.questions.map((q) => [q.id, [...q.correct]]));
    const tokens = Object.fromEntries(caseDef.questions.map((q) => [q.id, q.correct.map((optionId) => tokenFor(keys, q.id, optionId))]));
    const visits = Object.fromEntries(caseDef.technique.requiredZones.map((id, index) => [id, { dwellMs: 5000, listenMs: 0, visits: 1, firstOrder: index }]));
    const order = [...caseDef.technique.requiredZones];
    const bank = opaca.gradeCase(caseDef, keys, { index: 2, mode: "practice", answers: tokens, telemetry: { ...EMPTY_TELEMETRY, visits, order }, hintsUsed: 0 });
    const sim = simScoreCase(caseDef, decoded, { visits, order, toolUse: TOOL_USE }, 0, imageFor(caseDef), [...SIM_ZONES]);
    expect(bank.total).toBe(sim.total);
    expect(bank.max).toBe(sim.max);
    expect(bank.mastery).toBe(sim.mastery);
    expect(caseResultSchema.safeParse(bank).success).toBe(true);
    for (const question of caseDef.questions) {
      const qid = question.id;
      expect(bank.questions.find((q) => q.questionId === qid)?.correct).toBe(sim.answers.find((a) => a.qid === qid)?.correct);
    }
    // Doğru seçenekler jetonla döner (özgün kimlik değil).
    for (const question of caseDef.questions) {
      const feedback = bank.questions.find((q) => q.questionId === question.id);
      for (const token of feedback?.correctOptionIds ?? []) expect(token.startsWith("tok_")).toBe(true);
    }
    // Sorusu olmayan alanlar sonuçtan çıkarılır.
    for (const [key, value] of Object.entries(bank.domains)) expect(value.max, key).toBeGreaterThan(0);
    expect(bank.questions.every((q) => q.correct)).toBe(true);
    expect(publicCase.questions).toHaveLength(caseDef.questions.length);
  });

  it("tüm havuzda banka puanı sim-opaca scoreCase ile birebir aynı (diferansiyel)", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const def of allCases) {
      const { keys } = opaca.buildPublicCase(def, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random: rnd });
      const decoded = Object.fromEntries(def.questions.map((q) => [q.id, realAnswer(def, q)]));
      const tokens = Object.fromEntries(
        def.questions.map((q) => [
          q.id,
          (decoded[q.id] ?? []).flatMap((real) => {
            const map = keys.options[q.id] ?? {};
            const token = Object.keys(map).find((key) => map[key] === real);
            return token === undefined ? [real] : [token];
          }),
        ]),
      );
      const visits = Object.fromEntries(def.technique.requiredZones.map((id, index) => [id, { dwellMs: 5000, listenMs: 3000, visits: 1, firstOrder: index }]));
      const order = [...def.technique.requiredZones];
      const bank = opaca.gradeCase(def, keys, {
        index: 1,
        mode: "assessment",
        answers: tokens,
        telemetry: { ...EMPTY_TELEMETRY, visits, order },
        hintsUsed: 0,
      });
      const sim = simScoreCase(def, decoded, { visits, order, toolUse: TOOL_USE }, 0, imageFor(def), [...SIM_ZONES]);
      expect(bank.total, def.id).toBe(sim.total);
      expect(bank.mastery, def.id).toBe(sim.mastery);
      for (const q of def.questions) {
        expect(bank.questions.find((x) => x.questionId === q.id)?.correct, `${def.id}/${q.id}`).toBe(sim.answers.find((x) => x.qid === q.id)?.correct);
      }
    }
  });

  it("yanlış yanıt puanı düşürür; tanınmayan jeton puan getirmez", () => {
    const { keys } = opaca.buildPublicCase(caseDef, { index: 1, mode: "assessment", openedAt: OPENED_AT, newToken, random });
    const forged = Object.fromEntries(caseDef.questions.map((q) => [q.id, q.correct]));
    const result = opaca.gradeCase(caseDef, keys, { index: 1, mode: "assessment", answers: forged, telemetry: EMPTY_TELEMETRY, hintsUsed: 0 });
    expect(result.questions.every((q) => !q.correct)).toBe(true);
  });

  it("uygulamada ipucu cezası uygulanır (değerlendirmede uygulanmaz)", () => {
    const { keys } = opaca.buildPublicCase(caseDef, { index: 3, mode: "practice", openedAt: OPENED_AT, newToken, random });
    const answers = Object.fromEntries(caseDef.questions.map((q) => [q.id, q.correct.map((optionId) => tokenFor(keys, q.id, optionId))]));
    const base = opaca.gradeCase(caseDef, keys, { index: 3, mode: "practice", answers, telemetry: EMPTY_TELEMETRY, hintsUsed: 0 });
    const hinted = opaca.gradeCase(caseDef, keys, { index: 3, mode: "practice", answers, telemetry: EMPTY_TELEMETRY, hintsUsed: 2 });
    expect(hinted.total).toBe(Math.max(0, base.total - 10));
    const assess = opaca.gradeCase(caseDef, keys, { index: 3, mode: "assessment", answers, telemetry: EMPTY_TELEMETRY, hintsUsed: 2 });
    expect(assess.total).toBe(base.total);
  });

  it("checkQuestion doğru/yanlış seçenekleri jetonla bildirir", () => {
    const question = caseDef.questions[0];
    if (question === undefined) throw new Error("soru yok");
    const { keys } = opaca.buildPublicCase(caseDef, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    const good = opaca.checkQuestion(caseDef, keys, question.id, [tokenFor(keys, question.id, question.correct[0] as string)]);
    expect(good?.correct).toBe(true);
    const wrongOption = question.options.find((option) => !question.correct.includes(option.id));
    expect(wrongOption).toBeDefined();
    const bad = opaca.checkQuestion(caseDef, keys, question.id, [tokenFor(keys, question.id, wrongOption?.id ?? "")]);
    expect(bad?.correct).toBe(false);
    expect(opaca.checkQuestion(caseDef, keys, "yok", ["tok_0000000000"])).toBeNull();
  });
});

describe("sunucu oturum istatistiği (T235)", () => {
  const assessmentCases = allCases.filter((def) => def.modes.includes("assessment") && def.questions.length > 0);

  /** Banka sonuçlarından sim istemcisinin deneme kaydını üretir (istemci kuralı referansı). */
  function clientRecordOf(items: readonly { readonly caseDef: CaseDef; readonly result: ReturnType<typeof opaca.gradeCase> }[]) {
    return buildAttemptRecord({
      mode: "assessment",
      results: items.map(({ caseDef, result }) => ({
        caseId: caseDef.id,
        total: result.total,
        max: result.max,
        mastery: result.mastery,
        domains: result.domains as ClientCaseResult["domains"],
        answers: result.questions.map((question) => ({ qid: question.questionId, correct: question.correct, given: [] })),
        hintsUsed: result.hintsUsed,
      })),
      caseById: (id) => opaca.caseById(id),
      sessionSeed: 1,
      durationMs: 0,
      finishedAt: new Date(OPENED_AT),
    });
  }

  it("konu eşlemesi sim TOPIC_BADGE_MATCH ile birebir aynıdır", () => {
    expect(Object.keys(OPACA_TOPIC_MATCH)).toEqual(Object.keys(TOPIC_BADGE_MATCH));
    for (const findingId of Object.keys(FINDINGS)) {
      for (const topic of Object.keys(TOPIC_BADGE_MATCH)) {
        expect(OPACA_TOPIC_MATCH[topic]?.(findingId), `${topic}/${findingId}`).toBe(TOPIC_BADGE_MATCH[topic]?.(findingId));
      }
    }
  });

  it("istatistik sim buildAttemptRecord kuralıyla birebir aynıdır (diferansiyel)", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const items = assessmentCases.slice(0, 30).map((def) => {
      const { keys } = opaca.buildPublicCase(def, { index: 1, mode: "assessment", openedAt: OPENED_AT, newToken, random: rnd });
      const decoded = Object.fromEntries(def.questions.map((q) => [q.id, realAnswer(def, q)]));
      const tokens = Object.fromEntries(
        def.questions.map((q) => [
          q.id,
          (decoded[q.id] ?? []).flatMap((real) => {
            const map = keys.options[q.id] ?? {};
            const token = Object.keys(map).find((key) => map[key] === real);
            return token === undefined ? [real] : [token];
          }),
        ]),
      );
      const visits = Object.fromEntries(def.technique.requiredZones.map((id, index) => [id, { dwellMs: 5000, listenMs: 0, visits: 1, firstOrder: index }]));
      const order = [...def.technique.requiredZones];
      const result = opaca.gradeCase(def, keys, {
        index: 1,
        mode: "assessment",
        answers: tokens,
        telemetry: { ...EMPTY_TELEMETRY, visits, order },
        hintsUsed: 0,
      });
      return { caseDef: def, result };
    });
    const record = clientRecordOf(items);
    if (record === null) throw new Error("deneme kaydı yok");
    const stats = opacaSessionStats(items, { mode: "assessment", score: record.score, durationMs: 0 });
    const expectedTopics: Record<string, number> = {};
    for (const finding of record.extra.findings) {
      if (!finding.correct) continue;
      for (const [topic, match] of Object.entries(TOPIC_BADGE_MATCH)) {
        if (match(finding.finding)) expectedTopics[topic] = (expectedTopics[topic] ?? 0) + 1;
      }
    }
    expect(stats.topicCorrect).toEqual(expectedTopics);
    expect(stats.localizationHits).toBe(record.extra.localizationHits);
    expect(stats.qualityCorrect).toBe(record.extra.qualityCorrect);
    expect(stats.interpretationCorrect).toBe(record.extra.interpretationCorrect);
    expect(stats.abcdeComplete).toBe(record.extra.abcdeComplete);
    expect(stats.fastPerfect).toBe(record.extra.fastPerfect);
  });

  it("uygulamada konu doğruluğu sayılmaz; hızlı-kusursuz rozeti yalnız değerlendirmede", () => {
    const { keys } = opaca.buildPublicCase(assessmentCases[0] as CaseDef, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    const def = assessmentCases[0] as CaseDef;
    const answers = Object.fromEntries(def.questions.map((q) => [q.id, q.correct.map((optionId) => tokenFor(keys, q.id, optionId))]));
    const result = opaca.gradeCase(def, keys, { index: 1, mode: "practice", answers, telemetry: EMPTY_TELEMETRY, hintsUsed: 0 });
    const item = { caseDef: def, result };
    const practice = opacaSessionStats([item], { mode: "practice", score: result.total, durationMs: 0 });
    expect(practice.topicCorrect).toEqual({});
    expect(practice.fastPerfect).toBe(false);
    // Süre yarı sınırın üstüne çıkınca hızlı-kusursuz rozeti verilmez.
    const slow = opacaSessionStats([item], { mode: "assessment", score: 100, durationMs: (def.timeLimitSec ?? 0) * 1000 });
    expect(slow.fastPerfect).toBe(false);
    const fast = opacaSessionStats([item], { mode: "assessment", score: 100, durationMs: ((def.timeLimitSec ?? 0) * 1000) / 2 });
    expect(fast.fastPerfect).toBe(true);
  });
});

describe("lokalizasyon", () => {
  // (0,0) köşesi hiçbir hedef kutunun içinde olmayan bir soru seçilir.
  const pair = localizationPairs().find(({ caseDef, question }) => {
    const image = getImage(caseDef.imageId);
    if (image === undefined) return false;
    const boxes = image.annotations.filter((a) => a.finding === question.targetFinding && a.source !== "report_nlp");
    return boxes.length > 0 && !boxes.some((b) => b.x === 0 && b.y === 0);
  });
  if (pair === undefined) throw new Error("lokalizasyon sorusu yok");

  it("hedef kutunun merkezine işaret doğru sayılır", () => {
    const image = imageFor(pair.caseDef);
    const center = nearestFindingBoxCenter({ x: 0, y: 0 }, image, pair.question.targetFinding ?? "");
    if (center === null) throw new Error("hedef kutu yok");
    const { keys } = opaca.buildPublicCase(pair.caseDef, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    const result = opaca.gradeCase(pair.caseDef, keys, {
      index: 1,
      mode: "practice",
      answers: { [pair.question.id]: [encodeMark(center)] },
      telemetry: EMPTY_TELEMETRY,
      hintsUsed: 0,
    });
    expect(result.questions.find((q) => q.questionId === pair.question.id)?.correct).toBe(true);
  });

  it("hedef kutuların dışındaki (0,0) işareti yanlış sayılır", () => {
    const image = imageFor(pair.caseDef);
    const boxes = image.annotations.filter((a) => a.finding === pair.question.targetFinding && a.source !== "report_nlp");
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.some((b) => b.x === 0 && b.y === 0)).toBe(false);
    const { keys } = opaca.buildPublicCase(pair.caseDef, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    const result = opaca.gradeCase(pair.caseDef, keys, {
      index: 1,
      mode: "practice",
      answers: { [pair.question.id]: [encodeMark({ x: 0, y: 0 })] },
      telemetry: EMPTY_TELEMETRY,
      hintsUsed: 0,
    });
    expect(result.questions.find((q) => q.questionId === pair.question.id)?.correct).toBe(false);
  });

  it("lokalizasyon sorusu seçeneksizdir ve işaret jeton değildir", () => {
    const { publicCase } = opaca.buildPublicCase(pair.caseDef, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    const question = publicCase.questions.find((q) => q.id === pair.question.id);
    expect(question?.options).toEqual([]);
    expect(opacaPublicCaseSchema.safeParse(publicCase).success).toBe(true);
  });
});

describe("vaka seçimi ve envanter", () => {
  it("oturum seçimi doğru havuzdan tekrarsız 10 vaka verir", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = opaca.selectCaseIds("assessment", rnd);
    expect(ids).toHaveLength(opaca.SESSION_CASE_COUNT);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(opaca.caseById(id)?.modes).toContain("assessment");
  });

  it("odaklı uygulama oturumu yalnız o bulgudan en fazla 5 vaka seçer", () => {
    const finding = opaca.poolFor("practice")[0]?.primaryFinding ?? "normal";
    const ids = opaca.selectCaseIds("practice", () => 0.3, opaca.FOCUS_CASE_COUNT, finding);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(5);
    for (const id of ids) expect(opaca.caseById(id)?.primaryFinding).toBe(finding);
  });

  it("caseInventory yalnız sayı sayıları taşır", () => {
    const inventory = opaca.caseInventory();
    expect(inventory.totalCases).toBeGreaterThan(100);
    expect(inventory.practicePoolSize).toBeGreaterThan(100);
    expect(inventory.assessmentPoolSize).toBeGreaterThan(50);
    expect(inventory.assessmentQuestions).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(inventory)) {
      if (key === "coverage") continue;
      expect(typeof value, key).toBe("number");
    }
    for (const row of Object.values(inventory.coverage)) {
      expect(Object.keys(row).sort()).toEqual(["a", "p"]);
      expect(typeof row.a).toBe("number");
      expect(typeof row.p).toBe("number");
    }
    const covered = Object.values(inventory.coverage).reduce((sum, row) => ({ p: sum.p + row.p, a: sum.a + row.a }), { p: 0, a: 0 });
    expect(covered.p).toBe(inventory.totalCases);
    expect(covered.a).toBe(inventory.assessmentPoolSize);
  });
});

describe("istemci envanteri (A2.3)", () => {
  it("sim paketindeki case-inventory.json bankayla birebir aynı ve yalnız sayı taşır", () => {
    const client = JSON.parse(ts.sys.readFile("packages/sim-opaca/src/data/case-inventory.json") ?? "{}") as unknown;
    expect(client).toEqual(JSON.parse(JSON.stringify(opaca.caseInventory())));
    const raw = ts.sys.readFile("packages/sim-opaca/src/data/case-inventory.json") ?? "";
    expect(raw).not.toMatch(/auto_|feedbackCorrect|\.webp|"correct"|assets\//);
  });

  it("sim paketi istemci kaynağı anahtarlı vaka dosyalarını içe aktarmaz", () => {
    const files = [...ts.sys.readDirectory("packages", [".ts", ".tsx"]).filter((f) => /packages\/sim-opaca\/src\//.test(f))].filter(
      (f) => !f.includes("node_modules"),
    );
    const offenders = files.filter((f) => /cases(-auto)?\.json/.test(ts.sys.readFile(f) ?? ""));
    expect(offenders).toEqual([]);
  });
});
