import { describe, expect, it } from "vitest";
import { CardiacModel, LEADS } from "../../packages/sim-pulse/src/index";
import { curriculum } from "../../packages/sim-pulse/src/data/curriculum";
import { curriculumIndex, explanationsFor, optionsFor, seededPermutation } from "../../packages/sim-pulse/src/index";

const all = [...curriculumIndex.cases, ...curriculumIndex.questions];
const allowedSources = new Set(["AF2024", "SVT2019", "VA2022", "ALS2025", "ACS2023", "BBB2009", "ECG", "CYCLE", "REPOL2009"]);

describe("Pulse müfredat indeksi", () => {
  it("400 maddeyi id ile bulur ve S3 nesneleriyle aynı referansları verir", () => {
    expect(all).toHaveLength(400);
    expect(Object.keys(curriculumIndex.byId)).toHaveLength(400);
    for (const item of all) expect(curriculumIndex.byId[item.id]).toBe(item);
    expect(curriculumIndex.byId["missing"]).toBeUndefined();
  });

  it("kaynak seededPermutation kimlikten tekrarlanabilir beşli sıra üretir", () => {
    for (const item of all) {
      const first = seededPermutation(item.id);
      expect(first).toEqual(seededPermutation(item.id));
      expect([...first].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(optionsFor(item.id)).toEqual(item.options);
      expect(explanationsFor(item.id)).toEqual(item.explanations);
    }
    expect(optionsFor("missing")).toBeUndefined();
  });

  it("bankalar aynı karar kimliğindeki seçenek ve açıklamaları kanonik sırada tutar", () => {
    for (const item of all) {
      const bank = curriculumIndex.banks[item.decisionId];
      expect(bank, item.id).toBeDefined();
      expect(bank?.objective, item.id).toBe(item.objectiveIds[0]);
      expect(new Set(bank?.options).size, item.id).toBe(5);
      expect(bank?.explanations).toHaveLength(5);
    }
    expect(Object.keys(curriculumIndex.banks).length).toBeGreaterThan(0);
  });

  it("independent_content şema, kaynak, hedef ve klinik-nötr ad kontrollerini karşılar", () => {
    for (const item of all) {
      expect(item.id).toMatch(/^[CQ]\d{3}$/);
      expect(item.options).toHaveLength(5);
      expect(new Set(item.options).size, item.id).toBe(5);
      expect(item.explanations).toHaveLength(5);
      expect(item.correct).toBeGreaterThanOrEqual(0);
      expect(item.correct).toBeLessThan(5);
      expect(item.objectiveIds.every((id) => /^O[1-6]$/.test(id)), item.id).toBe(true);
      expect(item.sourceIds.every((id) => allowedSources.has(id)), item.id).toBe(true);
      expect(item.mode).toBe(item.ecg.mode);
      expect(item.ecg.leads.every((lead) => (LEADS as readonly string[]).includes(lead)), item.id).toBe(true);
      expect(/AF|flutter|STEMI|VF|sinüs|bloğu/i.test(item.title + item.ariaLabel), item.id).toBe(false);
    }
  });

  it("T04 mevcut tekrarlarını kaydeder: vaka vfFlow/noQrs, soru noQrs", () => {
    const repeated = (pool: ReadonlyArray<(typeof all)[number]>) => {
      const counts = new Map<string, number>();
      for (const item of pool) counts.set(`${item.mode}:${item.decisionId}`, (counts.get(`${item.mode}:${item.decisionId}`) ?? 0) + 1);
      return [...counts].filter(([, count]) => count > 1).map(([key]) => key).sort();
    };
    expect(repeated(curriculumIndex.cases)).toEqual(["vf:noQrs", "vf:vfFlow"]);
    expect(repeated(curriculumIndex.questions)).toEqual(["vf:noQrs"]);
  });

  it.fails("T04 açık bulgusu: tam metin/karar benzersizliği kaynak veride tekrarlı; düzeltme veya daraltma insan kararı bekliyor", () => {
    for (const pool of [curriculumIndex.cases, curriculumIndex.questions]) {
      expect(new Set(pool.map((item) => `${item.stem}\n${item.question}`)).size).toBe(200);
      expect(new Set(pool.map((item) => `${item.mode}:${item.decisionId}`)).size).toBe(200);
    }
  });

  it("independent_content sayısal hedeflerini EKG motoruna karşı doğrular", () => {
    const checked: Array<{ id: string; expected: number; actual: number }> = [];
    for (const item of all) {
      const id = item.decisionId;
      const model = new CardiacModel(item.mode, item.ecg.options);
      const beats = model.between(0, 8);
      const pvc = /q140|qt410/.test(id) && item.mode === "pvc";
      const beat = beats.find((candidate) => candidate.isPVC === pvc) ?? beats[0];
      if (beat === undefined) continue;
      let expected: number | undefined;
      if (/^q(80|140|160|180)$/.test(id)) expected = Math.round(beat.qrs * 1000);
      else if (/^pr(L|R)?(175|140)$/.test(id)) expected = Math.round((beat.pr ?? 0) * 1000);
      else if (/^qt(350|245|345|430|410)$/.test(id)) expected = Math.round(beat.qt * 1000);
      else if (/^rr(800|360|380|400|500)$/.test(id)) expected = Math.round(60 / beat.rr);
      else if (id === "st32") expected = 0.32;
      else if (id === "st20") expected = 0.2;
      else if (id === "iii28") expected = 0.28;
      else if (id === "avf24") expected = 0.24;
      else if (id === "avl18") expected = -0.18;
      else if (id === "inferiorAVR") expected = -0.06;
      else if (id === "anteriorAVL") expected = 0.06;
      else if (id === "pToQR315") expected = 315;
      else if (id === "pToQL335") expected = 335;
      else if (id === "grid200") expected = 200;
      else if (id === "pvcAverage") expected = 75;
      if (expected === undefined) continue;
      const match = item.options[item.correct]?.replaceAll("−", "-").replace(",", ".").match(/[+-]?\d+(?:\.\d+)?/);
      checked.push({ id: item.id, expected, actual: match?.[0] === undefined ? Number.NaN : Number(match[0]) });
      if (id === "st32") expect(Math.abs((model.metrics(beat.r + 0.1, "V3").st ?? Number.NaN) - expected), item.id).toBeLessThan(0.00001);
      if (id === "st20") expect(Math.abs((model.metrics(beat.r + 0.1, "II").st ?? Number.NaN) - expected), item.id).toBeLessThan(0.00001);
    }
    expect(checked.length).toBeGreaterThan(0);
    for (const item of checked) expect(Math.abs(item.actual - item.expected), item.id).toBeLessThan(0.001);
  });

  it("S3 verisini değiştirmeden kullanır", () => {
    expect(curriculumIndex.cases).toBe(curriculum.cases);
    expect(curriculumIndex.questions).toBe(curriculum.questions);
  });
});
