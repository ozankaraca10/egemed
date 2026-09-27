import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * T211 — Pulse soru havuzu patern 19–23 otomatik tıbbi QC.
 * Çalışan runtime kaynakları (vendor/model.js, curriculum.js, state.js) doğrudan
 * yüklenir; ADR-011 uyarınca vendor dosyaları platform kaynağıdır.
 * Sayısal kontroller motor parametreleriyle (hız, PR, QRS, retrograd P zamanı,
 * duraklama) karşılaştırılır; tıbbi doğruluk kabul ölçütüdür.
 */

const VENDOR = "packages/sim-pulse/src/runtime/vendor";
const NEW_MODES = ["pac", "junctional", "wpw", "pericarditis", "hyperk"] as const;

interface CurriculumItem {
  readonly id: string;
  readonly mode: string;
  readonly stem: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly explanations: readonly string[];
  readonly correct: number;
  readonly decisionId: string;
}
interface Bank {
  readonly objective: string;
  readonly options: readonly string[];
  readonly explanations: readonly string[];
}
interface ItemMeta {
  readonly bloom: "anlama" | "uygulama" | "analiz";
  readonly difficulty: 1 | 2 | 3;
  readonly objective: string;
  readonly refs: readonly string[];
}
interface CurriculumApi {
  readonly version: number;
  readonly limitations: string;
  readonly cases: readonly CurriculumItem[];
  readonly questions: readonly CurriculumItem[];
  readonly byId: Readonly<Record<string, CurriculumItem | undefined>>;
  readonly meta: Readonly<Record<string, ItemMeta | undefined>>;
}
interface StateSession {
  readonly ids: readonly string[];
  readonly answers: readonly (number | null)[];
  readonly submitted: readonly boolean[];
  readonly interactionIndices: readonly (number | null)[];
}
interface StateApi {
  decode(raw: unknown): { caseSession: StateSession; quizSession: StateSession };
}
interface Beat {
  readonly n: number;
  readonly r: number;
  readonly rr: number;
  readonly qrs: number;
  readonly qrsStart: number;
  readonly qrsEnd: number;
  readonly pr: number | null;
  readonly pKind: string | null;
}
interface AtrialEvent {
  readonly t: number;
  readonly kind: string;
  readonly beat?: number;
}
interface ModelInstance {
  between(a: number, b: number): readonly Beat[];
  metrics(time: number, lead?: string): { pr: number | null; qrs: number | null; rr: number | null };
  atrialEvents(a: number, b: number): readonly AtrialEvent[];
}
interface ModelApi {
  ALL_MODES: readonly string[];
  CardiacModel: new (mode: string, options?: Record<string, unknown>) => ModelInstance;
}

function runVendorFunction(path: string, transform: (source: string) => string = (source) => source): (env: Record<string, unknown>) => void {
  const source = transform(readFileSync(path, "utf8")).replace("export default function run", "return function run");
  return new Function("module", source)(undefined) as (env: Record<string, unknown>) => void;
}

const win: Record<string, unknown> = {};
runVendorFunction(`${VENDOR}/model.js`)({ window: win });
win["CardAIScorm"] = { previousStatus: "" };
// Bankalar yerel `banks` nesnesinde tutulur; QC için aynı çalıştırmada yakalanır.
runVendorFunction(`${VENDOR}/curriculum.js`, (source) => source.replace("const banks={};", "const banks={};root.__banks=banks;"))({ window: win });
runVendorFunction(`${VENDOR}/state.js`)({ window: win });

const curriculum = win["PulseCurriculum"] as CurriculumApi;
const stateApi = win["PulseState"] as StateApi;
const modelApi = win["CardAIModel"] as ModelApi;
const banks = win["__banks"] as Record<string, Bank>;
const newItems = [...curriculum.cases, ...curriculum.questions].filter((item) => (NEW_MODES as readonly string[]).includes(item.mode));

/** Kaynak `display()` dönüşümünün birebir karşılığı (harf–rakam aralığı ve noktalama). */
function display(text: string): string {
  return text
    .replace(/(\p{L})([0-9])/gu, "$1 $2")
    .replace(/([0-9])(\p{L})/gu, "$1 $2")
    .replace(/([,;:])(?=\p{L})/gu, "$1 ")
    .replace(/\bV ([1-6])\b/g, "V$1");
}

function correctText(item: CurriculumItem): string {
  return item.options[item.correct] ?? "";
}
function itemOf(id: string): CurriculumItem {
  const item = curriculum.byId[id];
  if (item === undefined) throw new Error(`Bilinmeyen madde: ${id}`);
  return item;
}
function firstNumber(text: string): number {
  const match = text.replaceAll("−", "-").replace(",", ".").match(/[+-]?\d+(?:\.\d+)?/);
  if (match?.[0] === undefined) throw new Error(`Sayı bulunamadı: ${text}`);
  return Number(match[0]);
}

function wordSet(text: string): ReadonlySet<string> {
  return new Set(text.toLocaleLowerCase("tr").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));
}
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

const FORBIDDEN_PHRASES = [
  "her zaman geniş qrs",
  "öncesinde p dalgası olmaz",
  "her zaman tam kompansatuvar",
  ">100/dk",
  "her qrs öncesinde normal sinüs p",
  "üçüncü derece av blok",
  "delta dalgası bağımsız",
  "herkes wpw sendromu",
  "pr normal veya uzun",
  "mutlaka normal dar",
  "her st elevasyonu stemi",
  "yalnızca tek koroner bölge",
  "tüm perikardit hastalarında",
  "tek başına ekg perikardit",
  "perikardit tanısını kesinleştirir",
  "ekg'den kesin hesaplanabilir",
  "belirli k değerinde belirli",
  "her zaman sivri t",
  "ciddi hiperkalemiyi dışlar",
] as const;
const STEM_FORBIDDEN_WORDS = [
  "erken atım", "kavşak", "junctional", "wpw", "preeksit", "delta",
  "perikardit", "hiperkalemi", "potasyum", "aritmi", "ritim bozukluğu",
] as const;
/** 22 ve 23 ritim değildir; patern metinlerinde ritim hastalığı dili kullanılmaz. */
const NOT_RHYTHM_MODES = ["pericarditis", "hyperk"] as const;

const sourceReferences = new Set(
  (JSON.parse(readFileSync("packages/sim-pulse/src/data/sources.json", "utf8")) as {
    references: readonly { id: string }[];
  }).references.map((reference) => reference.id),
);

const bankUsage = new Map<string, number>();
for (const item of newItems) bankUsage.set(item.decisionId, (bankUsage.get(item.decisionId) ?? 0) + 1);

describe("T211 havuz bütünlüğü", () => {
  it("her yeni patern 10 uygulama + 10 değerlendirme maddesi taşır", () => {
    for (const mode of NEW_MODES) {
      expect(curriculum.cases.filter((item) => item.mode === mode), mode).toHaveLength(10);
      expect(curriculum.questions.filter((item) => item.mode === mode), mode).toHaveLength(10);
    }
    expect(newItems).toHaveLength(100);
  });

  it("mevcut maddeler kimliğini korur; yeni maddeler C251–C300 / Q251–Q300 olarak arkaya eklenir", () => {
    const cases = Array.from({ length: 300 }, (_, index) => `C${String(index + 1).padStart(3, "0")}`);
    const questions = Array.from({ length: 300 }, (_, index) => `Q${String(index + 1).padStart(3, "0")}`);
    expect(curriculum.cases.map(({ id }) => id)).toEqual(cases);
    expect(curriculum.questions.map(({ id }) => id)).toEqual(questions);
    expect(Object.keys(curriculum.byId)).toHaveLength(600);
  });

  it("yeni bankalar p19_…p23_ önekli, benzersiz ve en fazla iki satırda kullanılır", () => {
    const bankPrefix: Readonly<Record<string, string>> = {
      pac: "p19_", junctional: "p20_", wpw: "p21_", pericarditis: "p22_", hyperk: "p23_",
    };
    for (const item of newItems) expect(item.decisionId.startsWith(bankPrefix[item.mode] ?? ""), item.id).toBe(true);
    const newBankIds = [...bankUsage.keys()];
    expect(newBankIds).toHaveLength(50);
    expect(new Set(newBankIds).size).toBe(50);
    const legacyBankIds = new Set(
      [...curriculum.cases.slice(0, 250), ...curriculum.questions.slice(0, 250)].map((item) => item.decisionId),
    );
    for (const bankId of newBankIds) {
      expect(bankId, bankId).toMatch(/^p(19|20|21|22|23)_/);
      expect(legacyBankIds.has(bankId), bankId).toBe(false);
      expect(bankUsage.get(bankId), bankId).toBeLessThanOrEqual(2);
      expect(banks[bankId], bankId).toBeDefined();
    }
  });

  it("sınırlılık metni gerçek madde sayısını dinamik taşır", () => {
    expect(curriculum.limitations).toContain("600 sentetik madde");
    expect(curriculum.limitations).toContain(`${modelApi.ALL_MODES.length} EKG sonucu`);
    expect(curriculum.limitations).toContain("Patern 14–23 (T204) sinyal ve içerikleri Kardiyoloji ABD onayı bekliyor.");
  });
});

describe("T211 madde ve bank kuralları", () => {
  it("her madde beş benzersiz seçenek/gerekçe taşır; doğru indeks bankın ilk satırını gösterir", () => {
    expect(newItems).toHaveLength(100);
    for (const item of newItems) {
      const bank = banks[item.decisionId];
      expect(bank, item.id).toBeDefined();
      expect(item.options, item.id).toHaveLength(5);
      expect(new Set(item.options).size, item.id).toBe(5);
      expect(item.explanations, item.id).toHaveLength(5);
      expect(item.explanations.every((explanation) => explanation.trim().length > 0), item.id).toBe(true);
      expect(item.correct, item.id).toBeGreaterThanOrEqual(0);
      expect(item.correct, item.id).toBeLessThan(5);
      expect(item.options[item.correct], item.id).toBe(display((bank as Bank).options[0] ?? ""));
    }
  });

  it("madde kimlikleri ve kök+soru tam metinleri benzersizdir", () => {
    const all = [...curriculum.cases, ...curriculum.questions];
    expect(new Set(all.map(({ id }) => id)).size).toBe(all.length);
    const stems = all.map((item) => `${item.stem}\n${item.question}`);
    expect(new Set(stems).size).toBe(all.length);
  });

  it("aynı patern içinde kök kelime kümeleri Jaccard < 0,8 (yakın kopya yok)", () => {
    for (const mode of NEW_MODES) {
      const sets = newItems.filter((item) => item.mode === mode).map((item) => wordSet(item.stem));
      expect(sets, mode).toHaveLength(20);
      for (let i = 0; i < sets.length; i += 1) {
        for (let j = i + 1; j < sets.length; j += 1) {
          expect(jaccard(sets[i] as ReadonlySet<string>, sets[j] as ReadonlySet<string>), `${mode} ${i}/${j}`).toBeLessThan(0.8);
        }
      }
    }
  });

  it("yasaklı ifadeler ve hepsi/hiçbiri seçeneklerde geçmez; kökte tanı kelimesi yok", () => {
    for (const item of newItems) {
      for (const text of [item.stem, item.question, ...item.options, ...item.explanations]) {
        const low = text.toLocaleLowerCase("tr");
        for (const phrase of FORBIDDEN_PHRASES) expect(low.includes(phrase), `${item.id}: ${phrase}`).toBe(false);
        expect(low.includes("hepsi"), item.id).toBe(false);
        expect(low.includes("hiçbiri"), item.id).toBe(false);
      }
      const stemLow = item.stem.toLocaleLowerCase("tr");
      for (const word of STEM_FORBIDDEN_WORDS) expect(stemLow.includes(word), `${item.id}: ${word}`).toBe(false);
      expect(stemLow.split(/[^\p{L}\p{N}]+/u).includes("pac"), item.id).toBe(false);
    }
  });

  it("22 ve 23 ritim değildir; maddeleri ritim hastalığı diliyle tanımlamaz", () => {
    for (const item of newItems) {
      if (!(NOT_RHYTHM_MODES as readonly string[]).includes(item.mode)) continue;
      for (const text of [item.stem, item.question, ...item.options, ...item.explanations]) {
        const low = text.toLocaleLowerCase("tr");
        expect(low.includes("ritim bozukluğu"), `${item.id}: ritim bozukluğu`).toBe(false);
        expect(low.includes("aritmi"), `${item.id}: aritmi`).toBe(false);
      }
    }
  });

  it("doğru seçenek patern başına maddelerin en fazla %40'ında en uzundur", () => {
    for (const mode of NEW_MODES) {
      const items = newItems.filter((item) => item.mode === mode);
      const longest = items.filter((item) => {
        const lengths = item.options.map((option) => option.length);
        const max = Math.max(...lengths);
        return lengths[item.correct] === max && lengths.filter((length) => length === max).length === 1;
      });
      expect(longest.length / items.length, mode).toBeLessThanOrEqual(0.4);
    }
  });

  it("itemMeta her yeni bank için dolu; refs kaynakça kayıtlarıyla uyumlu; Bloom dağılımı hedefte", () => {
    const bloom = { anlama: 0, uygulama: 0, analiz: 0 };
    for (const bankId of bankUsage.keys()) {
      const meta = curriculum.meta[bankId];
      expect(meta, bankId).toBeDefined();
      expect(["anlama", "uygulama", "analiz"], bankId).toContain(meta?.bloom);
      expect([1, 2, 3], bankId).toContain(meta?.difficulty);
      expect((meta?.objective ?? "").trim().length, bankId).toBeGreaterThan(10);
      expect((meta?.refs.length ?? 0), bankId).toBeGreaterThan(0);
      for (const ref of meta?.refs ?? []) expect(sourceReferences.has(ref), `${bankId}: ${ref}`).toBe(true);
      bloom[meta?.bloom ?? "anlama"] += 2;
    }
    expect(bloom).toEqual({ anlama: 20, uygulama: 50, analiz: 30 });
  });
});

describe("T211 motor tutarlılığı (hız, PR, QRS, zamanlama)", () => {
  it("PAC: bağlaşım, kompansatuvar olmayan duraklama, PR 150 ms ve dar QRS motorla uyumludur", () => {
    const model = new modelApi.CardiacModel("pac");
    const beats = model.between(0, 10);
    const ectopic = beats.find((beat) => beat.pKind === "ectopic");
    const sinus = beats.find((beat) => beat.pKind === "sinus");
    expect(ectopic, "ektopik atım").toBeDefined();
    expect(sinus, "sinüs atımı").toBeDefined();
    const ectopicBeat = ectopic as Beat;
    const sinusBeat = sinus as Beat;
    // Bağlaşım ≈560 ms (motor 540–580 ms).
    const coupling = ectopicBeat.rr * 1000;
    expect(coupling).toBeGreaterThanOrEqual(540);
    expect(coupling).toBeLessThanOrEqual(580);
    expect(itemOf("C256").stem).toContain("560");
    expect(correctText(itemOf("C256"))).toContain("560");
    // Duraklama 900–970 ms ve tam kompansatuvar değil.
    const next = beats[beats.indexOf(ectopicBeat) + 1] as Beat;
    expect(next.rr * 1000).toBeGreaterThanOrEqual(900);
    expect(next.rr * 1000).toBeLessThanOrEqual(970);
    expect(ectopicBeat.rr + next.rr).toBeLessThan(2 * sinusBeat.rr);
    expect(itemOf("C257").stem).toContain("950");
    // Erken atım: PR 150 ms, QRS 80 ms.
    const metrics = model.metrics(ectopicBeat.r + 0.01, "II");
    expect(metrics.pr, "PR").toBe(150);
    expect(metrics.qrs, "QRS").toBe(80);
    expect(correctText(itemOf("C258"))).toContain("150");
    expect(correctText(itemOf("C258"))).toContain("80");
    // Temel sinüs hızı ≈72/dk.
    expect(Math.abs(60 / sinusBeat.rr - 72)).toBeLessThan(1.5);
    expect(itemOf("C259").stem).toContain("833");
    expect(firstNumber(correctText(itemOf("C259")))).toBe(72);
  });

  it("Kavşak: hız ≈47/dk, QRS 80 ms ve retrograd P QRS sonundan ≈75 ms sonra gelir", () => {
    const model = new modelApi.CardiacModel("junctional");
    const beats = model.between(0, 10);
    const beat = beats[0] as Beat;
    expect(Math.abs(60 / beat.rr - 47)).toBeLessThan(0.5);
    expect(correctText(itemOf("C268"))).toContain("47");
    expect(itemOf("C268").stem).toContain("1280");
    const metrics = model.metrics(beat.r + 0.01, "II");
    expect(metrics.qrs, "QRS").toBe(80);
    const retro = model.atrialEvents(0, 10).find((event) => event.kind === "retro");
    expect(retro, "retrograd P").toBeDefined();
    const retroBeat = beats.find((candidate) => candidate.n === (retro as AtrialEvent).beat) as Beat;
    const offset = ((retro as AtrialEvent).t - (retroBeat.r + retroBeat.qrsEnd)) * 1000;
    expect(offset).toBeGreaterThanOrEqual(74);
    expect(offset).toBeLessThanOrEqual(76);
    expect(correctText(itemOf("C267"))).toContain("75");
  });

  it("WPW: PR 100 ms, QRS 140 ms ve hız ≈72/dk motorla uyumludur", () => {
    const model = new modelApi.CardiacModel("wpw");
    const beats = model.between(0, 10);
    const beat = beats[0] as Beat;
    const metrics = model.metrics(beat.r + 0.01, "II");
    expect(metrics.pr, "PR").toBe(100);
    expect(metrics.qrs, "QRS").toBe(140);
    expect(correctText(itemOf("C272"))).toContain("100");
    expect(firstNumber(correctText(itemOf("C273")))).toBe(140);
    expect(Math.abs(60 / beat.rr - 72.3)).toBeLessThan(1);
    expect(itemOf("C274").stem).toContain("830");
    expect(firstNumber(correctText(itemOf("C274")))).toBe(72);
  });

  it("Perikardit: hız ≈88/dk, PR 160 ms ve QRS 80 ms motorla uyumludur", () => {
    const model = new modelApi.CardiacModel("pericarditis");
    const beats = model.between(0, 10);
    const beat = beats[0] as Beat;
    expect(Math.abs(60 / beat.rr - 88.2)).toBeLessThan(1);
    expect(itemOf("C288").stem).toContain("680");
    expect(firstNumber(correctText(itemOf("C288")))).toBe(88);
    const metrics = model.metrics(beat.r + 0.01, "II");
    expect(metrics.pr, "PR").toBe(160);
    expect(metrics.qrs, "QRS").toBe(80);
    expect(itemOf("C289").stem).toContain("80");
    expect(itemOf("C289").stem).toContain("160");
    expect(correctText(itemOf("C289"))).toContain("dar");
  });

  it("Hiperkalemi: PR 240 ms ve QRS 120 ms motorla uyumludur", () => {
    const model = new modelApi.CardiacModel("hyperk");
    const beat = model.between(0, 10)[0] as Beat;
    const metrics = model.metrics(beat.r + 0.01, "II");
    expect(metrics.pr, "PR").toBe(240);
    expect(metrics.qrs, "QRS").toBe(120);
    expect(correctText(itemOf("C298"))).toContain("240");
    expect(firstNumber(correctText(itemOf("C299")))).toBe(120);
  });
});

describe("T211 eski oturum çözümü ve yeni sınırlar", () => {
  const session = (n: number[]): Record<string, unknown> => ({
    i: "egemed-eski-oturum-211",
    n,
    a: n.map(() => 0),
    s: 1023,
    l: n.map(() => [0, 0, 0]),
    x: n.map(() => -1),
  });
  const record = (caseN: number[], quizN: number[]): Record<string, unknown> => ({
    version: 6,
    cv: curriculum.version,
    m: 0,
    t: 2,
    p: 1,
    f: 0,
    v: modelApi.ALL_MODES.map(() => 16000),
    u: 4,
    c: session(caseN),
    q: session(quizN),
  });

  it("C001–C200 / Q001–Q200 kayıtları aynen çözülür, gönderim durumu korunur", () => {
    const decoded = stateApi.decode(record([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [191, 192, 193, 194, 195, 196, 197, 198, 199, 200]));
    expect(decoded.caseSession.ids).toEqual(["C001", "C002", "C003", "C004", "C005", "C006", "C007", "C008", "C009", "C010"]);
    expect(decoded.quizSession.ids).toEqual(["Q191", "Q192", "Q193", "Q194", "Q195", "Q196", "Q197", "Q198", "Q199", "Q200"]);
    expect(decoded.caseSession.submitted.every(Boolean)).toBe(true);
    expect(decoded.quizSession.submitted.every(Boolean)).toBe(true);
  });

  it("yeni maddeler (C251–C300/Q251–Q300) oturumda çözülür; sınır dışı numara örneklemeye döner", () => {
    const boundary = stateApi.decode(record([291, 292, 293, 294, 295, 296, 297, 298, 299, 300], [291, 292, 293, 294, 295, 296, 297, 298, 299, 300]));
    expect(boundary.caseSession.ids[0]).toBe("C291");
    expect(boundary.caseSession.ids[9]).toBe("C300");
    expect(boundary.quizSession.ids[9]).toBe("Q300");
    expect(boundary.caseSession.ids.every((id) => curriculum.byId[id] !== undefined)).toBe(true);
    const invalid = stateApi.decode(record([301, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9, 301]));
    expect(invalid.caseSession.ids).toHaveLength(10);
    expect(invalid.quizSession.ids).toHaveLength(10);
    expect(invalid.caseSession.ids.every((id) => curriculum.byId[id] !== undefined)).toBe(true);
    expect(invalid.quizSession.ids.includes("Q301")).toBe(false);
  });
});
