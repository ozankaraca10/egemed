import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * T210 — Pulse soru havuzu patern 14–18 otomatik tıbbi QC.
 * Çalışan runtime kaynakları (vendor/model.js, curriculum.js, state.js) doğrudan
 * yüklenir; ADR-011 uyarınca vendor dosyaları platform kaynağıdır.
 */

const VENDOR = "packages/sim-pulse/src/runtime/vendor";
const NEW_MODES = ["sinbrady", "avb1", "mobitz1", "mobitz2", "chb"] as const;

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
interface ModelApi {
  ALL_MODES: readonly string[];
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

function wordSet(text: string): ReadonlySet<string> {
  return new Set(text.toLocaleLowerCase("tr").split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1));
}
function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

const FORBIDDEN_PHRASES = [
  "Her bradikardi patolojiktir",
  "1. derece AV blokta QRS düşer",
  "Mobitz I'de PR sabittir",
  "Mobitz II'de önce PR giderek uzar",
  "Mobitz II daima geniş QRS'lidir",
  "2:1 AV blok otomatik olarak Mobitz II'dir",
  "Tam AV blokta sabit PR vardır",
  "Tam AV blokta P dalgaları QRS'leri tetikler",
  "Her AV blokta pacemaker zorunludur",
] as const;
const DIAGNOSIS_WORDS_IN_STEM = ["bradikardi", "av blok", "mobitz", "wenckebach", "tam blok", "dissosiyasyon", "1. derece", "2. derece", "3. derece"] as const;

const sourceReferences = new Set(
  (JSON.parse(readFileSync("packages/sim-pulse/src/data/sources.json", "utf8")) as {
    references: readonly { id: string }[];
  }).references.map((reference) => reference.id),
);

const bankUsage = new Map<string, number>();
for (const item of newItems) bankUsage.set(item.decisionId, (bankUsage.get(item.decisionId) ?? 0) + 1);

describe("T210 havuz bütünlüğü", () => {
  it("her yeni patern 10 uygulama + 10 değerlendirme maddesi taşır", () => {
    for (const mode of NEW_MODES) {
      expect(curriculum.cases.filter((item) => item.mode === mode), mode).toHaveLength(10);
      expect(curriculum.questions.filter((item) => item.mode === mode), mode).toHaveLength(10);
    }
    expect(newItems).toHaveLength(100);
  });

  it("mevcut 400 madde kimliği değişmez; yeni maddeler C201–C250 / Q201–Q250 olarak arkaya eklenir", () => {
    expect(curriculum.cases.map(({ id }) => id)).toEqual(Array.from({ length: 250 }, (_, index) => `C${String(index + 1).padStart(3, "0")}`));
    expect(curriculum.questions.map(({ id }) => id)).toEqual(Array.from({ length: 250 }, (_, index) => `Q${String(index + 1).padStart(3, "0")}`));
    expect(Object.keys(curriculum.byId)).toHaveLength(500);
  });

  it("yeni bankalar p14_…p18_ önekli, benzersiz ve en fazla iki satırda kullanılır", () => {
    const newBankIds = [...bankUsage.keys()];
    expect(newBankIds).toHaveLength(50);
    expect(new Set(newBankIds).size).toBe(50);
    const legacyBankIds = new Set(
      [...curriculum.cases.slice(0, 200), ...curriculum.questions.slice(0, 200)].map((item) => item.decisionId),
    );
    for (const bankId of newBankIds) {
      expect(bankId, bankId).toMatch(/^p1[4-8]_/);
      expect(legacyBankIds.has(bankId), bankId).toBe(false);
      expect(bankUsage.get(bankId), bankId).toBeLessThanOrEqual(2);
      expect(banks[bankId], bankId).toBeDefined();
    }
  });

  it("sınırlılık metni gerçek madde sayısını dinamik taşır", () => {
    expect(curriculum.limitations).toContain("500 sentetik madde");
    expect(curriculum.limitations).toContain(`${modelApi.ALL_MODES.length} EKG sonucu`);
    expect(curriculum.limitations).toContain("Patern 14–23 (T204) sinyal ve içerikleri Kardiyoloji ABD onayı bekliyor.");
  });
});

describe("T210 madde ve bank kuralları", () => {
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
        for (const phrase of FORBIDDEN_PHRASES) expect(text.includes(phrase), `${item.id}: ${phrase}`).toBe(false);
        expect(text.includes("hepsi"), item.id).toBe(false);
        expect(text.includes("hiçbiri"), item.id).toBe(false);
      }
      for (const word of DIAGNOSIS_WORDS_IN_STEM) expect(item.stem.toLocaleLowerCase("tr").includes(word), `${item.id}: ${word}`).toBe(false);
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

describe("T210 eski oturum çözümü (C001–C200, Q001–Q200)", () => {
  const session = (n: number[]): Record<string, unknown> => ({
    i: "egemed-eski-oturum-001",
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

  it("C001–C010 ve Q191–Q200 kimlikleri aynen çözülür, gönderim durumu korunur", () => {
    const decoded = stateApi.decode(record([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [191, 192, 193, 194, 195, 196, 197, 198, 199, 200]));
    expect(decoded.caseSession.ids).toEqual(["C001", "C002", "C003", "C004", "C005", "C006", "C007", "C008", "C009", "C010"]);
    expect(decoded.quizSession.ids).toEqual(["Q191", "Q192", "Q193", "Q194", "Q195", "Q196", "Q197", "Q198", "Q199", "Q200"]);
    expect(decoded.caseSession.submitted.every(Boolean)).toBe(true);
    expect(decoded.quizSession.submitted.every(Boolean)).toBe(true);
    expect(decoded.caseSession.interactionIndices.every((value) => value === null)).toBe(true);
  });

  it("sınır kimlikleri (C200/Q200 ve C250/Q250) kabul edilir; sınır dışı numara oturumu örnekleme döndürür", () => {
    const boundary = stateApi.decode(record([200, 199, 198, 197, 196, 195, 194, 193, 192, 191], [200, 199, 198, 197, 196, 195, 194, 193, 192, 191]));
    expect(boundary.caseSession.ids[0]).toBe("C200");
    expect(boundary.quizSession.ids[0]).toBe("Q200");
    const newBoundary = stateApi.decode(record([241, 242, 243, 244, 245, 246, 247, 248, 249, 250], [241, 242, 243, 244, 245, 246, 247, 248, 249, 250]));
    expect(newBoundary.caseSession.ids).toEqual(["C241", "C242", "C243", "C244", "C245", "C246", "C247", "C248", "C249", "C250"]);
    expect(newBoundary.quizSession.ids[9]).toBe("Q250");
    const invalid = stateApi.decode(record([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9, 251]));
    expect(invalid.caseSession.ids).toHaveLength(10);
    expect(invalid.quizSession.ids).toHaveLength(10);
    expect(invalid.quizSession.ids.includes("Q251")).toBe(false);
    expect(invalid.caseSession.ids.every((id) => curriculum.byId[id] !== undefined)).toBe(true);
  });
});
