import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PULSE_ECG_MODES } from "../../packages/contracts/src/index";

/**
 * T220 (A3.4, ADR-009): Çalışan runtime müfredatı (`vendor/curriculum.js`) madde
 * içeriği taşımaz; tek doğruluk kaynağı sunucu bankasıdır. İstemcide kalan
 * etiket/kaynak/derivasyon haritaları ve bankayla birebir eşit sayılar doğrulanır.
 */

const VENDOR = "packages/sim-pulse/src/runtime/vendor";
const BANK_FILE = "packages/assessment-bank/data/pulse/items.json";

function runVendorFunction(path: string): (env: Record<string, unknown>) => void {
  const source = readFileSync(path, "utf8").replace("export default function run", "return function run");
  return new Function("module", source)(undefined) as (env: Record<string, unknown>) => void;
}

interface ModelApi {
  ALL_MODES: readonly string[];
}

interface RuntimeCurriculum {
  readonly version: number;
  readonly sessionSize: number;
  readonly caseCount: number;
  readonly quizCount: number;
  readonly patterns: Readonly<Record<string, { readonly case: number; readonly quiz: number }>>;
  readonly labels: Readonly<Record<string, string>>;
  readonly modeSources: Readonly<Record<string, readonly string[]>>;
  readonly leads: Readonly<Record<string, readonly string[]>>;
  readonly limitations: string;
}

interface BankItem {
  readonly id: string;
  readonly section: "case" | "quiz";
  readonly mode: string;
  readonly feedback: string;
  readonly explanations: readonly string[];
}

interface BankFile {
  readonly version: number;
  readonly sessionSize: number;
  readonly count: number;
  readonly items: readonly BankItem[];
}

const win: Record<string, unknown> = {};
runVendorFunction(`${VENDOR}/model.js`)({ window: win });
win["CardAIScorm"] = { previousStatus: "" };
runVendorFunction(`${VENDOR}/curriculum.js`)({ window: win });

const curriculum = win["PulseCurriculum"] as RuntimeCurriculum;
const model = win["CardAIModel"] as ModelApi;
const source = readFileSync(`${VENDOR}/curriculum.js`, "utf8");
const bank = JSON.parse(readFileSync(BANK_FILE, "utf8")) as BankFile;

function patternsOf(items: readonly BankItem[]): Record<string, { case: number; quiz: number }> {
  const patterns: Record<string, { case: number; quiz: number }> = {};
  for (const item of items) {
    const row = patterns[item.mode] ?? { case: 0, quiz: 0 };
    row[item.section] += 1;
    patterns[item.mode] = row;
  }
  return Object.fromEntries(Object.keys(patterns).sort().map((key) => [key, patterns[key]!]));
}

describe("Pulse runtime müfredatı — madde içeriği kaldırıldı (T220)", () => {
  it("cases/questions/byId/meta/banks alanları yoktur; nesne dondurulmuştur", () => {
    const keys = Object.keys(curriculum);
    for (const removed of ["cases", "questions", "byId", "meta", "banks", "itemMeta"]) {
      expect(keys, removed).not.toContain(removed);
    }
    expect(Object.keys(curriculum).sort()).toEqual(
      ["caseCount", "labels", "leads", "limitations", "modeSources", "patterns", "quizCount", "sessionSize", "version"].sort(),
    );
    expect(Object.isFrozen(curriculum)).toBe(true);
  });

  it("kaynak dosyada madde üretimi ve anahtarlı alanlar kalmamıştır", () => {
    for (const token of ["caseRows", "quizRows", "extraCases", "extraQuestions", "patternCaseRows", "patternQuizRows", "itemMeta", "explanations", "correct", "feedback"]) {
      expect(source.includes(token), token).toBe(false);
    }
  });

  it("madde gerekçe/geri bildirim metinleri paketlenmiş müfredatta geçmez", () => {
    const serialized = JSON.stringify(curriculum);
    for (const item of bank.items.filter((_, index) => index % 12 === 0)) {
      expect(serialized.includes(JSON.stringify(item.feedback).slice(1, -1)), item.id).toBe(false);
      for (const explanation of item.explanations) {
        expect(serialized.includes(JSON.stringify(explanation).slice(1, -1)), item.id).toBe(false);
      }
    }
  });

  it("sürüm, oturum boyutu, madde sayıları ve patern dağılımı bankayla birebir aynıdır", () => {
    expect(curriculum.version).toBe(bank.version);
    expect(curriculum.sessionSize).toBe(bank.sessionSize);
    expect(curriculum.caseCount).toBe(bank.items.filter((item) => item.section === "case").length);
    expect(curriculum.quizCount).toBe(bank.items.filter((item) => item.section === "quiz").length);
    expect(curriculum.caseCount + curriculum.quizCount).toBe(bank.count);
    expect(curriculum.patterns).toEqual(patternsOf(bank.items));
  });

  it("etiket, kaynak ve derivasyon haritaları 23 paterni kapsar", () => {
    const modes = [...model.ALL_MODES].sort();
    expect(Object.keys(curriculum.labels).sort()).toEqual(modes);
    expect(Object.keys(curriculum.modeSources).sort()).toEqual(modes);
    expect(Object.keys(curriculum.leads).sort()).toEqual(modes);
    for (const mode of model.ALL_MODES) {
      expect(curriculum.labels[mode]?.trim().length, mode).toBeGreaterThan(0);
      expect(curriculum.modeSources[mode]?.length, mode).toBeGreaterThan(0);
      expect(curriculum.leads[mode], mode).toHaveLength(3);
    }
    expect(curriculum.limitations).toBe(
      "Pulse'taki EKG'ler, hekimlerce etiketlenmiş açık erişimli veri kümelerindeki gerçek hasta kayıtlarından güncel kılavuz ölçütleriyle seçilmiş ve Ege Üniversitesi Tıp Fakültesi Kardiyoloji Anabilim Dalı'ndan Doç. Dr. Evrim Şimşek tarafından doğrulanmıştır.",
    );
  });

  it("sözleşmedeki EKG mod listesi motorun ALL_MODES'u ve banka modlarıyla aynıdır", () => {
    expect([...PULSE_ECG_MODES]).toEqual([...model.ALL_MODES]);
    expect(PULSE_ECG_MODES).toHaveLength(23);
    expect([...new Set(bank.items.map((item) => item.mode))].sort()).toEqual([...model.ALL_MODES].sort());
  });
});
