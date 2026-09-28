import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { curriculum } from "../../packages/sim-pulse/src/data/curriculum";

// T220 (A3.4, ADR-009): TS müfredat aynası madde içeriği taşımaz; kalan sayılar
// sunucu bankasıyla (`packages/assessment-bank/data/pulse/items.json`) birebir eşit olmalıdır.

const BANK_FILE = "packages/assessment-bank/data/pulse/items.json";

interface BankItem {
  readonly id: string;
  readonly section: "case" | "quiz";
  readonly mode: string;
}

interface BankFile {
  readonly version: number;
  readonly sessionSize: number;
  readonly count: number;
  readonly items: readonly BankItem[];
}

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

describe("Pulse istemci müfredat aynası (T220)", () => {
  it("madde içeriği alanları yoktur; yalnız etiket, sayı ve sınırlılık kalır", () => {
    const keys = Object.keys(curriculum);
    for (const removed of ["cases", "questions", "byId", "meta", "banks", "itemMeta"]) {
      expect(keys, removed).not.toContain(removed);
    }
    expect(Object.keys(curriculum).sort()).toEqual(
      ["caseCount", "labels", "limitations", "patterns", "quizCount", "sessionSize", "version"].sort(),
    );
    expect(JSON.stringify(curriculum)).not.toMatch(/"correct"|"explanations"|"feedback"/);
  });

  it("sürüm, oturum boyutu ve madde sayıları bankayla birebir aynıdır", () => {
    expect(curriculum.version).toBe(bank.version);
    expect(curriculum.sessionSize).toBe(bank.sessionSize);
    expect(curriculum.caseCount + curriculum.quizCount).toBe(bank.count);
    expect(curriculum.caseCount).toBe(bank.items.filter((item) => item.section === "case").length);
    expect(curriculum.quizCount).toBe(bank.items.filter((item) => item.section === "quiz").length);
  });

  it("patern başına vaka/değerlendirme sayıları banka envanteriyle aynıdır", () => {
    expect(curriculum.patterns).toEqual(patternsOf(bank.items));
    expect(Object.keys(curriculum.patterns)).toHaveLength(23);
    const total = Object.values(curriculum.patterns).reduce((sum, row) => sum + row.case + row.quiz, 0);
    expect(total).toBe(bank.count);
  });

  it("etiketler bankadaki 23 paterni kapsar ve sınırlılık metni güncel sayıları taşır", () => {
    const modes = [...new Set(bank.items.map((item) => item.mode))].sort();
    expect(Object.keys(curriculum.labels).sort()).toEqual(modes);
    expect(Object.values(curriculum.labels).every((label) => label.trim().length > 0)).toBe(true);
    expect(curriculum.limitations).toContain("600 sentetik madde");
    expect(curriculum.limitations).toContain("23 EKG sonucu");
  });
});
