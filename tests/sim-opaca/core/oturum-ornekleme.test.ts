import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, questionSignature, sampleSession, shuffledOptions } from "../../../packages/sim-opaca/src/index";
import type { CaseDef, Question } from "../../../packages/sim-opaca/src/index";

/** Oturum örnekleme grubu — kaynak egemed-opaca tests/core.test.ts `describe('oturum örnekleme')` portu
 *  (8 test). Örnekleme tohumludur (mulberry32); `Math.random` yoktur, tüm çıktı seed'e bağlıdır.
 *  Fixture'lar kaynak testin qChoice/mkCase yardımcılarıyla birebir aynıdır. */

const qChoice: Question = {
  id: "q1",
  type: "finding_identify",
  domain: "recognition",
  prompt: "p",
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  correct: ["a"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const qMark: Question = {
  id: "q2",
  type: "localization",
  domain: "localization",
  prompt: "p",
  options: [],
  correct: [],
  targetFinding: "pneumothorax",
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const qQuality: Question = {
  id: "q3",
  type: "film_quality",
  domain: "quality",
  prompt: "p",
  options: [
    { id: "a", label: "PA" },
    { id: "b", label: "AP" },
  ],
  correct: ["a"],
  feedbackCorrect: "",
  feedbackIncorrect: "",
};

const REQUIRED = ["a_trachea", "b_r_upper", "c_heart", "d_r_diaphragm", "e_bones"];

const mkCase = (over: Partial<CaseDef> = {}): CaseDef => ({
  id: "case_t",
  title: "T",
  modes: ["practice", "assessment"],
  population: "yetiskin",
  patient: { age: 50, sex: "kadın" },
  chiefComplaint: "",
  history: "",
  vitalSigns: {},
  objectives: [],
  imageId: "img_t",
  primaryFinding: "pneumothorax",
  clinicalDiagnosis: null,
  mappingValidation: "validated",
  technique: { requiredZones: REQUIRED, minDwellMs: 500, systematicOrder: true },
  questions: [qChoice, qMark, qQuality],
  feedback: { summary: "" },
  references: [],
  scoringWeights: { ...DEFAULT_WEIGHTS, diagnosis: 0, interpretation: 0, recognition: 50 },
  ...over,
});

describe("oturum örnekleme (kaynak davranışı)", () => {
  // Gerçek veride her vaka farklı görüntüden türediği için soru metni/seçenekleri vaka başına değişir;
  // burada da her vakaya benzersiz prompt veren bir soru kümesi üretilir (imza çakışmaması için).
  // NOT: qMark/qQuality burada KASITLI olarak dahil edilmez — ikisi de sabit (paylaşılan) nesnelerdir ve
  // dahil edilirse her vaka bu iki soru için de aynı imzayı paylaşır, testin ölçmek istediği şeyi bozar.
  const uniqueQuestions = (i: number): Question[] => [
    { ...qChoice, id: "q1", prompt: `Vaka ${i} bulgusu nedir?`, options: [{ id: "a", label: `Bulgu ${i}` }, { id: "b", label: "Diğer" }], correct: ["a"] },
  ];
  const pool = Array.from({ length: 30 }, (_, i) =>
    mkCase({ id: `c${i}`, primaryFinding: ["pneumothorax", "normal", "cardiomegaly"][i % 3]!, questions: uniqueQuestions(i) })
  );

  it("deterministik ve katmanlı", () => {
    const a = sampleSession(pool, 7, 10);
    expect(a).toEqual(["c7", "c28", "c24", "c29", "c14", "c22", "c12", "c19", "c11", "c2"]);
    expect(new Set(a).size).toBe(10);
    const findingsIn = new Set(a.map((id) => pool.find((c) => c.id === id)!.primaryFinding));
    expect(findingsIn.size).toBe(3);
  });

  it("küçük havuz tamamen döner, boş havuz boş", () => {
    expect(sampleSession(pool.slice(0, 4), 1, 10)).toHaveLength(4);
    expect(sampleSession([], 1, 10)).toEqual([]);
  });

  it("seçenek karıştırma deterministik (K1)", () => {
    const opts = ["a", "b", "c", "d"].map((id) => ({ id, label: id }));
    expect(shuffledOptions("x", "q", opts).map((o) => o.id)).toEqual(["a", "c", "d", "b"]);
    expect(shuffledOptions("x", "q", opts).map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("soru imzası: prompt/seçenek/doğru-yanıt aynıysa aynı imza, biri değişirse farklı", () => {
    const a = questionSignature(uniqueQuestions(1)[0]!);
    const c = questionSignature(uniqueQuestions(2)[0]!);
    expect(a).toBe("finding_identify||Bulgu 1");
    expect(a).not.toBe(c);
    // seçenek id'leri (shuffledOptions ile) farklı olsa da etiketler aynıysa imza aynı kalır
    const swapped = { ...qChoice, options: [{ id: "z", label: "A" }, { id: "y", label: "B" }], correct: ["z"] };
    expect(questionSignature(qChoice)).toBe(questionSignature(swapped));
  });

  it("V2 (düzeltilmiş tanım): görüntüye bağlı sorular imgeId+doğru-yanıtla, bilgi soruları prompt+doğru-yanıtla ayrışır", () => {
    // GÖRÜNTÜYE BAĞLI (finding_identify/localization/film_quality): prompt farklı olsa da AYNI görüntü +
    // AYNI doğru yanıtsa imza AYNI kalır (görüntüye özgü ama aynı kalıpta sorulan meşru soru — tekrar değil);
    // AYNI prompt olsa da FARKLI görüntüde imza FARKLI olur.
    const findingA = { ...qChoice, prompt: "Bu grafideki ana bulgu hangisidir?", correct: ["a"] };
    const findingB = { ...qChoice, prompt: "Bambaşka bir soru kökü, ana bulgu?", correct: ["a"] };
    expect(questionSignature(findingA, "img_1")).toBe(questionSignature(findingB, "img_1"));
    expect(questionSignature(findingA, "img_1")).not.toBe(questionSignature(findingA, "img_2"));
    // BİLGİ sorusu (interpretation): AYNI görüntüId'ye bakılmaksızın yalnız prompt+doğru-yanıt imzayı belirler.
    const interp: Question = {
      id: "qi",
      type: "interpretation",
      domain: "interpretation",
      prompt: "ABCDE sırası nedir?",
      options: [{ id: "a", label: "X" }],
      correct: ["a"],
      feedbackCorrect: "",
      feedbackIncorrect: "",
    };
    expect(questionSignature(interp, "img_1")).toBe(questionSignature(interp, "img_2"));
    expect(questionSignature(interp, "img_1")).toBe(questionSignature({ ...interp, id: "other" }));
    expect(questionSignature(interp)).not.toBe(questionSignature({ ...interp, prompt: "Başka bir bilgi sorusu" }));
  });

  it("V2/§3 oturum içi tekrar yasağı: aynı imzalı sorular olan vakalar aynı oturumda iki kez seçilmez", () => {
    // 12 farklı bulgudan, her birinde İKİ vaka birebir aynı soru kümesini (kopya içerik) paylaşıyor —
    // sampleSession bu çiftlerden en fazla birini seçmeli, aksi halde öğrenci aynı soruyu iki kez görür.
    // Bulgu sayısı (12) oturum boyutundan (10) büyük olduğu için çakışmasız bir 10'luk oturum her zaman mümkün.
    const collidingPool: CaseDef[] = [];
    let idx = 0;
    const findingList = [
      "pneumothorax",
      "normal",
      "cardiomegaly",
      "atelectasis",
      "nodule_mass",
      "pleural_effusion",
      "tuberculosis",
      "emphysema",
      "tuberculosis_cavity",
      "tuberculosis_fibrosis",
      "hyperinflation",
      "edema",
    ];
    for (const f of findingList) {
      const qs = uniqueQuestions(idx++);
      collidingPool.push(mkCase({ id: `${f}_a`, primaryFinding: f, questions: qs }));
      collidingPool.push(mkCase({ id: `${f}_b`, primaryFinding: f, questions: qs })); // aynı soru imzaları
    }
    for (let seed = 0; seed < 25; seed++) {
      const ids = sampleSession(collidingPool, seed, 10);
      const seen = new Set<string>();
      for (const id of ids) {
        const c = collidingPool.find((cc) => cc.id === id)!;
        for (const q of c.questions) {
          const sig = questionSignature(q);
          expect(seen.has(sig)).toBe(false);
          seen.add(sig);
        }
      }
    }
  });

  it("V2/§3 onarım turu: FARKLI bulgu gruplarındaki vakalar aynı soruyu paylaşırsa havuzdan değiştirilir", () => {
    // Gerçek üretimde saptanan kök neden: iki AYRI bulgunun (ör. 'normal' ve 'miliary_pattern')
    // birer vakası aynı sabit soruyu (ör. tekil projeksiyon sorusu) paylaşırsa, tur 1'in "grup içinde
    // çakışmasız aday bul" mantığı bunu YAKALAYAMAZ (grup tek üyeli, çakışma kontrolü yalnız kendi
    // bulgu grubuna bakar) — onarım turu, TÜM havuzdan (bulgu grubuyla sınırlı kalmadan) bir
    // değiştirme bulup bu çakışmayı gidermelidir.
    const shared: Question = {
      ...qChoice,
      id: "q_shared",
      prompt: "Ortak/sabit soru",
      options: [{ id: "a", label: "X" }, { id: "b", label: "Y" }],
      correct: ["a"],
    };
    const repairPool: CaseDef[] = [];
    const fillerFindings = [
      "pneumothorax",
      "cardiomegaly",
      "atelectasis",
      "nodule_mass",
      "pleural_effusion",
      "tuberculosis",
      "tuberculosis_cavity",
      "tuberculosis_fibrosis",
      "edema",
    ];
    fillerFindings.forEach((f, i) => repairPool.push(mkCase({ id: `${f}_case`, primaryFinding: f, questions: uniqueQuestions(i) })));
    // iki AYRI bulgu grubu (tek üyeli), ikisi de yalnız paylaşılan sabit soruyu içeriyor
    repairPool.push(mkCase({ id: "normal_case", primaryFinding: "normal", questions: [shared] }));
    repairPool.push(mkCase({ id: "miliary_case", primaryFinding: "miliary_pattern", questions: [shared] }));
    // yedek: onarım turunun değiştirme için kullanabileceği, benzersiz sorulu ek bir bulgu
    repairPool.push(mkCase({ id: "spare_case", primaryFinding: "hyperinflation", questions: uniqueQuestions(999) }));
    for (let seed = 0; seed < 60; seed++) {
      const ids = sampleSession(repairPool, seed, 10);
      const seen = new Set<string>();
      for (const id of ids) {
        const c = repairPool.find((cc) => cc.id === id)!;
        for (const q of c.questions) {
          const sig = questionSignature(q);
          expect(seen.has(sig)).toBe(false);
          seen.add(sig);
        }
      }
    }
  });

  it("V2/§2a (koordinatör kararı, 1000 tohum): aynı BİLGİ sorusu (interpretation) FARKLI görüntülerdeki iki vakada da olsa aynı oturumda iki kez çıkmaz", () => {
    // Gerçek senaryo: iki farklı bulgunun (dolayısıyla farklı görüntülerin) vakaları aynı kütüphane
    // varyantını (ör. aynı "bir sonraki adım" sorusu) paylaşabilir — görüntüId farklı olduğundan
    // görüntüye bağlı bir soru olsaydı bu sorun olmazdı, ama BİLGİ sorusu görüntüden bağımsızdır: imza
    // yalnız prompt+doğru-yanıta bakar, bu yüzden sampleSession'ın çakışma kaçınması burada da çalışmalı.
    const interpPool: CaseDef[] = [];
    const findingList = [
      "pneumothorax",
      "normal",
      "cardiomegaly",
      "atelectasis",
      "nodule_mass",
      "pleural_effusion",
      "tuberculosis",
      "emphysema",
      "tuberculosis_cavity",
      "tuberculosis_fibrosis",
      "hyperinflation",
      "edema",
    ];
    findingList.forEach((f, idx) => {
      const q: Question = {
        id: "qi",
        type: "interpretation",
        domain: "interpretation",
        prompt: `Bilgi sorusu ${idx}`,
        options: [{ id: "a", label: `Doğru ${idx}` }, { id: "b", label: "Diğer" }],
        correct: ["a"],
        feedbackCorrect: "",
        feedbackIncorrect: "",
      };
      interpPool.push(mkCase({ id: `${f}_a`, primaryFinding: f, imageId: `img_${f}_a`, questions: [q] }));
      interpPool.push(mkCase({ id: `${f}_b`, primaryFinding: f, imageId: `img_${f}_b`, questions: [q] })); // farklı görüntü, AYNI bilgi sorusu
    });
    for (let seed = 0; seed < 1000; seed++) {
      const ids = sampleSession(interpPool, seed, 10);
      const seen = new Set<string>();
      for (const id of ids) {
        const c = interpPool.find((cc) => cc.id === id)!;
        for (const q of c.questions) {
          const sig = questionSignature(q, c.imageId);
          expect(seen.has(sig)).toBe(false);
          seen.add(sig);
        }
      }
    }
  });
});
