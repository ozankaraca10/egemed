import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PULSE_ECG_LEADS, PULSE_ECG_MODES, caseResultSchema, pulsePublicCaseSchema, simSessionCaseResponseSchema } from "../../packages/contracts/src/index";
import type { PulseEcgLead, PulseEcgMode } from "../../packages/contracts/src/index";
import { pulse } from "../../packages/assessment-bank/src/index";

// T215/T220 (A3.1/A3.4, ADR-009): Pulse maddelerinin tek doğruluk kaynağı bu
// dosyadır (`data/pulse/items.json`; dışa aktarma betiği kaldırıldı). Bütünlük
// testi şemaya ve sayılara dayanır; anahtarsız projeksiyon doğru seçeneği,
// gerekçeleri ve geri bildirimi sızdırmaz; sunucu notlandırması jetonlu yanıtı
// doğru puanlar.

const BANK_FILE = "packages/assessment-bank/data/pulse/items.json";
const OPENED_AT = "2026-09-27T10:00:00.000+03:00";

interface BankVital {
  readonly k: string;
  readonly v: string;
}
interface BankEcg {
  readonly mode: PulseEcgMode;
  readonly options: Record<string, string | number | boolean>;
  readonly leads: readonly PulseEcgLead[];
  readonly start: number;
  readonly seconds: number;
}
interface BankItem {
  readonly id: string;
  readonly section: "case" | "quiz";
  readonly mode: PulseEcgMode;
  readonly stem: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct: number;
  readonly explanations: readonly string[];
  readonly feedback: string;
  readonly objectiveIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly vitals: readonly BankVital[];
  readonly ecg: BankEcg;
}
interface BankFile {
  readonly version: number;
  readonly sessionSize: number;
  readonly count: number;
  readonly items: readonly BankItem[];
}

const bankText = readFileSync(BANK_FILE, "utf8");
const bankFile = JSON.parse(bankText) as BankFile;

let counter = 0;
const newToken = () => `tok_${(counter++).toString(36).padStart(10, "0")}`;
const random = () => 0.42;

function itemAt(index: number): BankItem {
  const item = bankFile.items[index];
  if (item === undefined) throw new Error(`madde yok: ${index}`);
  return item;
}

function tokenFor(keys: pulse.PulseCaseKeys, index: number): string {
  const token = Object.keys(keys.options).find((key) => keys.options[key] === index);
  if (token === undefined) throw new Error(`jeton yok: ${index}`);
  return token;
}

function differentIndex(item: BankItem): number {
  const index = item.options.findIndex((_, i) => i !== item.correct);
  if (index < 0) throw new Error(`${item.id}: çeldirici yok`);
  return index;
}

describe("banka bütünlüğü (tek doğruluk kaynağı data/pulse/items.json)", () => {
  it("600 madde: 300 vaka + 300 değerlendirme; kimlikler benzersiz ve artan", () => {
    expect(bankFile.count).toBe(600);
    expect(bankFile.items).toHaveLength(600);
    const cases = bankFile.items.filter((item) => item.section === "case");
    const quiz = bankFile.items.filter((item) => item.section === "quiz");
    expect(cases).toHaveLength(300);
    expect(quiz).toHaveLength(300);
    expect(cases.map((item) => item.id)).toEqual(
      Array.from({ length: 300 }, (_, index) => `C${String(index + 1).padStart(3, "0")}`),
    );
    expect(quiz.map((item) => item.id)).toEqual(
      Array.from({ length: 300 }, (_, index) => `Q${String(index + 1).padStart(3, "0")}`),
    );
    const ids = bankFile.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(pulse.caseById("C001")).toBeDefined();
    expect(pulse.caseById("Q300")).toBeDefined();
    expect(pulse.caseById("C999")).toBeUndefined();
  });

  it("her madde zorunlu alanları, beş benzersiz seçeneği ve beş gerekçeyi taşır", () => {
    for (const item of bankFile.items) {
      const prefix = item.section === "case" ? "C" : "Q";
      expect(item.id, item.id).toMatch(new RegExp(`^${prefix}\\d{3}$`));
      expect(PULSE_ECG_MODES, item.id).toContain(item.mode);
      for (const value of [item.stem, item.question, item.feedback]) {
        expect(value.trim().length, item.id).toBeGreaterThan(0);
      }
      expect(item.options, item.id).toHaveLength(5);
      expect(item.options.every((option) => option.trim().length > 0), item.id).toBe(true);
      expect(new Set(item.options).size, item.id).toBe(5);
      expect(item.explanations, item.id).toHaveLength(5);
      expect(item.explanations.every((explanation) => explanation.trim().length > 0), item.id).toBe(true);
      expect(new Set(item.explanations).size, item.id).toBeGreaterThan(1);
      expect(Number.isInteger(item.correct) && item.correct >= 0 && item.correct < 5, item.id).toBe(true);
      expect(item.objectiveIds.length > 0 && item.objectiveIds.every((id) => /^O[1-6]$/.test(id)), item.id).toBe(true);
      expect(item.sourceIds.length > 0 && item.sourceIds.every((id) => id.trim().length > 0), item.id).toBe(true);
      expect(item.vitals.length, item.id).toBeGreaterThan(0);
      expect(item.vitals.every(({ k, v }) => k.trim().length > 0 && v.trim().length > 0), item.id).toBe(true);
      expect(item.ecg.mode, item.id).toBe(item.mode);
      expect(item.ecg.leads, item.id).toHaveLength(3);
      expect(item.ecg.leads.every((lead) => (PULSE_ECG_LEADS as readonly string[]).includes(lead)), item.id).toBe(true);
      expect(Number.isFinite(item.ecg.start) && item.ecg.start >= 0, item.id).toBe(true);
      expect(Number.isFinite(item.ecg.seconds) && item.ecg.seconds > 0, item.id).toBe(true);
    }
  });

  it("banka sürümü ve oturum boyutu dosyayla tutarlıdır", () => {
    expect(pulse.BANK_VERSION).toBe(bankFile.version);
    expect(pulse.SESSION_SIZE).toBe(bankFile.sessionSize);
    expect(pulse.SESSION_CASE_COUNT).toBe(bankFile.sessionSize);
    expect(bankFile.sessionSize).toBeGreaterThan(0);
  });

  it("sözleşmedeki EKG mod listesi bankadaki 23 paterni kapsar", () => {
    expect(PULSE_ECG_MODES).toHaveLength(23);
    expect([...new Set(bankFile.items.map((item) => item.mode))].sort()).toEqual([...PULSE_ECG_MODES].sort());
  });
});

describe("anahtarsız projeksiyon — sızıntı taraması", () => {
  for (const mode of ["practice", "assessment"] as const) {
    it(`${mode}: 20 maddede sözleşmeye uyar ve anahtar sızdırmaz`, () => {
      const stride = Math.max(1, Math.floor(bankFile.items.length / 20));
      const sample = bankFile.items.filter((_, index) => index % stride === 0).slice(0, 20);
      expect(sample).toHaveLength(20);
      for (const item of sample) {
        const { publicCase, keys } = pulse.buildPublicCase(item, { index: 1, mode, openedAt: OPENED_AT, newToken, random });
        const parsed = pulsePublicCaseSchema.safeParse(publicCase);
        expect(parsed.success, `${item.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe(true);
        expect(simSessionCaseResponseSchema.safeParse({ data: publicCase }).success, item.id).toBe(true);
        expect(publicCase.section, item.id).toBe(item.section);
        expect(publicCase.label, item.id).toBe("Vaka 1");
        const json = JSON.stringify(publicCase);
        // Kimlik, gerekçeler ve geri bildirim istemciye gitmez.
        expect(json, item.id).not.toContain(JSON.stringify(item.id));
        expect(json, item.id).not.toContain(JSON.stringify(item.feedback));
        for (const explanation of item.explanations) expect(json, `${item.id}/${explanation}`).not.toContain(JSON.stringify(explanation));
        expect(json, item.id).not.toMatch(/"correct"|"explanations"|"feedback"|"objectiveIds"|"sourceIds"|"decisionId"|"title"|"note"/);
        // Seçenekler karıştırılır ve opak jetonlanır; jeton→indeks eşlemesi yalnız sunucudadır.
        expect(publicCase.options, item.id).toHaveLength(5);
        expect(new Set(publicCase.options.map((option) => option.id)).size, item.id).toBe(5);
        expect(new Set(publicCase.options.map((option) => option.label)).size, item.id).toBe(5);
        for (const option of publicCase.options) {
          expect(option.id.startsWith("tok_"), item.id).toBe(true);
          expect(keys.options[option.id], `${item.id}/${option.id}`).toBeDefined();
        }
        expect(keys.options[tokenFor(keys, item.correct)], item.id).toBe(item.correct);
        // EKG bilinen sınır gereği gerçek adla gider (tanı sorusunda doğru cevabı ele verebilir).
        expect(publicCase.ecg.mode, item.id).toBe(item.mode);
        expect(publicCase.ecg.leads, item.id).toHaveLength(3);
      }
    });
  }
});

describe("sunucu notlandırması", () => {
  const item = itemAt(0);

  it("checkQuestion doğru jetonu ve şık gerekçesini bildirir", () => {
    const { keys } = pulse.buildPublicCase(item, { index: 1, mode: "practice", openedAt: OPENED_AT, newToken, random });
    const correctToken = tokenFor(keys, item.correct);
    const good = pulse.checkQuestion(item, keys, [correctToken]);
    expect(good).toEqual({
      questionId: "q",
      correct: true,
      correctOptionIds: [correctToken],
      feedback: item.feedback,
    });
    const wrongIndex = differentIndex(item);
    const bad = pulse.checkQuestion(item, keys, [tokenFor(keys, wrongIndex)]);
    expect(bad.correct).toBe(false);
    expect(bad.correctOptionIds).toEqual([correctToken]);
    expect(bad.feedback).toBe(item.explanations[wrongIndex]);
    // Tanınmayan jeton ve özgün indeks jeton gibi gönderilirse yanlıştır.
    expect(pulse.checkQuestion(item, keys, ["tok_unknown000"]).correct).toBe(false);
    expect(pulse.checkQuestion(item, keys, [String(item.correct)]).correct).toBe(false);
  });

  it("gradeCase doğru jetonla 100, yanlışla 0 verir; sözleşme sonucu geçerlidir", () => {
    const { keys } = pulse.buildPublicCase(item, { index: 2, mode: "assessment", openedAt: OPENED_AT, newToken, random });
    const good = pulse.gradeCase(item, keys, {
      index: 2,
      mode: "assessment",
      answers: { q: [tokenFor(keys, item.correct)] },
      hintsUsed: 0,
    });
    expect(caseResultSchema.safeParse(good).success).toBe(true);
    expect(good.total).toBe(100);
    expect(good.max).toBe(100);
    expect(good.mastery).toBe(true);
    expect(good.diagnosis).toBeNull();
    expect(good.summary).toBe(item.feedback);
    expect(good.title).toMatch(/^Sentetik (vaka|değerlendirme) [CQ]\d{3}$/);
    expect(good.title).not.toContain(item.feedback);
    expect(good.domains).toEqual({ recognition: { earned: 100, max: 100 } });
    expect(good.questions.map((question) => question.questionId)).toEqual(["q"]);
    expect(good.questions[0]?.correct).toBe(true);
    expect(good.questions[0]?.correctOptionIds).toEqual([tokenFor(keys, item.correct)]);

    const bad = pulse.gradeCase(item, keys, {
      index: 2,
      mode: "assessment",
      answers: { q: [tokenFor(keys, differentIndex(item))] },
      hintsUsed: 0,
    });
    expect(bad.total).toBe(0);
    expect(bad.mastery).toBe(false);
    expect(bad.domains).toEqual({ recognition: { earned: 0, max: 100 } });
    expect(bad.questions[0]?.correct).toBe(false);

    const missing = pulse.gradeCase(item, keys, { index: 2, mode: "practice", answers: {}, hintsUsed: 0 });
    expect(missing.total).toBe(0);
    expect(pulse.hintFor()).toBeNull();
  });
});

describe("vaka seçimi ve envanter", () => {
  it("oturum seçimi doğru bölümden tekrarsız 10 madde verir", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [mode, section] of [["practice", "case"], ["assessment", "quiz"], ["challenge", "quiz"]] as const) {
      const ids = pulse.selectCaseIds(mode, rnd);
      expect(ids).toHaveLength(pulse.SESSION_CASE_COUNT);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(pulse.caseById(id)?.section, id).toBe(section);
    }
  });

  it("havuzlar bölümle birebir eşleşir", () => {
    expect(pulse.poolFor("practice").every((entry) => entry.section === "case")).toBe(true);
    expect(pulse.poolFor("assessment").every((entry) => entry.section === "quiz")).toBe(true);
    expect(pulse.poolFor("challenge")).toEqual(pulse.poolFor("assessment"));
  });

  it("odaklı uygulama oturumu tek EKG paterninden en fazla 5 madde seçer", () => {
    const ids = pulse.selectCaseIds("practice", () => 0.3, pulse.FOCUS_CASE_COUNT, "af");
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(5);
    for (const id of ids) expect(pulse.caseById(id)?.mode, id).toBe("af");
  });

  it("envanter yalnız sayı taşır ve paternler toplamı madde sayısına eşittir", () => {
    const inventory = pulse.caseInventory();
    expect(inventory.totalCases).toBe(300);
    expect(inventory.totalQuestions).toBe(300);
    expect(inventory.practicePoolSize).toBe(300);
    expect(inventory.assessmentPoolSize).toBe(300);
    for (const [key, value] of Object.entries(inventory)) {
      if (key === "patterns") continue;
      expect(typeof value, key).toBe("number");
    }
    const patternKeys = Object.keys(inventory.patterns);
    expect(patternKeys).toHaveLength(23);
    let total = 0;
    for (const key of patternKeys) {
      const row = inventory.patterns[key];
      if (row === undefined) throw new Error(`patern yok: ${key}`);
      expect(typeof row.case, key).toBe("number");
      expect(typeof row.quiz, key).toBe("number");
      expect(row.case).toBeGreaterThanOrEqual(10);
      expect(row.quiz).toBeGreaterThanOrEqual(10);
      total += row.case + row.quiz;
    }
    expect(total).toBe(600);
    expect(JSON.stringify(inventory)).not.toMatch(/[CQ]\d{3}|correct|feedback/);
  });

  it("banka dosyası yalnız veriyi taşır; müfredat senkronuna bağlı değildir", () => {
    expect(bankText).not.toMatch(/curriculum|export-bank/);
  });
});
