import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXTERNAL_RECORDS, RECORDS, SESSION_SIZE, resolveAssignment, resolveAssignmentEx, sampleSession, shuffledOptions, validateCase } from "../../packages/sim-ausculta/src/index";
import { poolFor } from "./bank-cases";
import type { CaseDef } from "../../packages/sim-ausculta/src/index";

/** Kaynak tests/core.test.ts:417-506 (12 test → 12 test). */

const DATA = "packages/sim-ausculta/src/data";
const pointIds = (JSON.parse(readFileSync(`${DATA}/auscultation-points.json`, "utf8")) as { points: { id: string }[] }).points.map(
  (p) => p.id,
);
const soundKeys = new Set<string>();

/* ---------------- oturum örnekleme ve havuz bütünlüğü ---------------- */
describe("oturum örnekleme (rastgele 10 vaka)", () => {
  const pool = poolFor("practice");
  const assessment = poolFor("assessment");

  it("her oturumda tam 10 vaka seçilir", () => {
    expect(sampleSession(pool, 42).length).toBe(SESSION_SIZE);
    expect(sampleSession(assessment, 7).length).toBe(SESSION_SIZE);
  });
  it("aynı tohum aynı örneklemi üretir (deterministik / SCORM uyumlu)", () => {
    const fixture = Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`,
      primaryAcousticFinding: ["normal", "s3", "wheezing"][i % 3],
    })) as CaseDef[];
    expect(sampleSession(fixture, 123)).toEqual(["a8", "a9", "a1", "a7", "a2", "a5", "a10", "a0", "a4", "a6"]);
  });
  it("farklı tohumlar farklı örneklem üretir (her oturum farklı)", () => {
    const a = sampleSession(pool, 1).join(",");
    const b = sampleSession(pool, 2).join(",");
    expect(a).not.toBe(b);
  });
  it("örneklem havuz dışından vaka içermez ve tekrar etmez", () => {
    const ids = sampleSession(pool, 99);
    expect(new Set(ids).size).toBe(ids.length);
    const poolIds = new Set(pool.map((c) => c.id));
    for (const id of ids) expect(poolIds.has(id)).toBe(true);
  });
  it("vaka havuzu veri seti sınırlarına kadar geniştir", () => {
    expect(pool.length).toBeGreaterThanOrEqual(100);
    expect(assessment.length).toBeGreaterThanOrEqual(60);
  });
  it("havuzdaki tüm vakalar doğrulanmış ses atamaları çözer", () => {
    for (const c of pool) {
      for (const a of c.soundAssignments) {
        const rec = a.soundId
          ? RECORDS.find((r) => r.id === a.soundId)
          : (resolveAssignment({ ...a, pointId: a.pointId }) ?? resolveAssignmentEx(a).record);
        expect(rec, `${c.id} → ${a.pointId}`).not.toBeNull();
      }
    }
  });
  it("otomatik üretilen tüm vakalar şema doğrulamasından geçer", () => {
    const errs: string[] = [];
    for (const c of [...pool, ...poolFor("assessment")]) {
      const issues = validateCase(c, pointIds, soundKeys).filter((i) => i.severity === "error");
      if (issues.length) errs.push(`${c.id}: ${issues.map((i) => i.message).join("; ")}`);
    }
    expect(errs).toEqual([]);
  });
  it("pediatrik vakalar mevcut ve pediatrik havuzda temsil ediliyor", () => {
    const ped = pool.filter((c) => (c as { population?: string }).population === "pediatrik");
    expect(ped.length).toBeGreaterThanOrEqual(3);
  });
  it("gerçek pediatrik hasta kayıtları (CirCor) vaka havuzuna bağlanmıştır", () => {
    const pedCases = pool.filter((c) => c.id.startsWith("auto_ped_"));
    expect(pedCases.length).toBeGreaterThanOrEqual(3);
    for (const c of pedCases) {
      const usesReal = c.soundAssignments.some((a) => a.soundId && EXTERNAL_RECORDS.some((r) => r.id === a.soundId));
      expect(usesReal, c.id).toBe(true);
    }
  });
  it("değerlendirme havuzu yalnız doğrulanmış eşlemeli vakalar içerir", () => {
    for (const c of assessment) expect(c.mappingValidation).toBe("validated");
  });
});

describe("soru seçenek karıştırma (K1)", () => {
  const poolAll = [...poolFor("practice"), ...poolFor("assessment")];

  it("aynı vaka+soru tohumu aynı sırayı üretir (deterministik)", () => {
    const options = ["a", "b", "c", "d"].map((id) => ({ id }));
    expect(shuffledOptions("x", "q", options).map((option) => option.id)).toEqual(["a", "c", "d", "b"]);
  });

  it('doğru yanıt konumu havuz genelinde tek bir seçeneğe (ör. "a") yığılmaz', () => {
    const positions: Record<number, number> = {};
    let total = 0;
    for (const c of poolAll) {
      for (const q of c.questions) {
        if (q.correct.length !== 1) continue; // yalnız tek doğru yanıtlı sorular konum analizine girer
        const shuffled = shuffledOptions(c.id, q.id, q.options);
        const correctId = q.correct[0];
        const pos = shuffled.findIndex((o) => o.id === correctId);
        positions[pos] = (positions[pos] ?? 0) + 1;
        total++;
      }
    }
    for (const [pos, count] of Object.entries(positions)) {
      expect(count / total, `konum ${pos} oranı`).toBeLessThanOrEqual(0.45);
    }
  });
});
