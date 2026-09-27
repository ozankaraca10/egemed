import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * T208 — Pulse 23 patern arayüzü, kategori çerçeveleri ve öğrenme kilidi.
 * Çalışan runtime kaynakları (vendor/model.js, state.js, curriculum.js, markup.js)
 * doğrudan yüklenir; ADR-011 uyarınca vendor dosyaları platform kaynağıdır.
 */

const VENDOR = "packages/sim-pulse/src/runtime/vendor";

function runVendorFunction(path: string): (env: Record<string, unknown>) => void {
  const source = readFileSync(path, "utf8").replace("export default function run", "return function run");
  return new Function("module", source)(undefined) as (env: Record<string, unknown>) => void;
}

function loadVendorExpression(path: string): string {
  const source = readFileSync(path, "utf8").replace("export default ", "return ");
  return new Function("module", source)(undefined) as string;
}

const win: Record<string, unknown> = {};
runVendorFunction(`${VENDOR}/model.js`)({ window: win });
win["CardAIScorm"] = { previousStatus: "" };
runVendorFunction(`${VENDOR}/curriculum.js`)({ window: win });
runVendorFunction(`${VENDOR}/state.js`)({ window: win });

interface ModelApi {
  MODES: readonly string[];
  PATTERN_MODES: readonly string[];
  ALL_MODES: readonly string[];
}
interface SessionShape {
  readonly ids: readonly string[];
  readonly answers: readonly (number | null)[];
  readonly submitted: readonly boolean[];
}
interface StateShape {
  mode: string;
  viewed: Record<string, number>;
  caseSession: SessionShape;
  quizSession: SessionShape;
  activeView: string;
}
interface CurriculumShape {
  readonly version: number;
  readonly labels: Readonly<Record<string, string>>;
  readonly limitations: string;
}
interface StateApi {
  blank(): StateShape;
  decode(raw: unknown): StateShape;
  encode(state: StateShape): Record<string, unknown>;
  derive(state: StateShape): { simComplete: boolean; casesComplete: boolean; casesUnlocked: boolean; quizUnlocked: boolean };
}

const modelApi = win["CardAIModel"] as ModelApi;
const stateApi = win["PulseState"] as StateApi;
const curriculumApi = win["PulseCurriculum"] as CurriculumShape;
const markup = loadVendorExpression(`${VENDOR}/markup.js`);
const curriculumSource = readFileSync(`${VENDOR}/curriculum.js`, "utf8");

/** `const name={...};` (iç içe süslü parantez yok) tanımını değerlendirir. */
function vendorObject(name: string): Record<string, unknown> {
  const match = new RegExp(`const ${name}=\\{([^}]*)\\};`).exec(curriculumSource);
  if (match === null) throw new Error(`${name} bulunamadı`);
  return new Function(`return {${match[1] as string}}`)() as Record<string, unknown>;
}

const VIEW_MS = 16_000;
const completeViews = (): number[] => modelApi.ALL_MODES.map(() => VIEW_MS);
const GROUP_ORDER = [
  "normal", "sintach", "sinbrady",
  "pac", "pat", "svt", "af", "flutter",
  "avb1", "mobitz1", "mobitz2", "chb", "junctional",
  "pvc", "vt", "vf",
  "rbbb", "lbbb", "wpw",
  "stemi", "inferior", "pericarditis", "hyperk",
] as const;
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const completedCaseSession = {
  i: "egemed-test-session-001",
  n: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  a: Array.from({ length: 10 }, () => 0),
  s: 1023,
  l: Array.from({ length: 10 }, () => [0, 0, 0]),
  x: Array.from({ length: 10 }, () => -1),
};

/** v6 kaydı: verilen görüntüleme dizisi ve (isteğe bağlı) tamamlanmış vaka oturumu. */
function v6Record(views: readonly number[], casesComplete = false): Record<string, unknown> {
  return {
    version: 6,
    cv: curriculumApi.version,
    m: 0,
    t: 2,
    p: 1,
    f: 0,
    v: [...views],
    u: 4,
    ...(casesComplete ? { c: completedCaseSession } : {}),
  };
}

describe("T208 ritim seçici — kategori çerçeveleri", () => {
  it("23 sekme grup sırasıyla tam bir kez, numaralar 01–23", () => {
    const modes = [...markup.matchAll(/data-mode="([a-z0-9]+)"/g)].map((match) => match[1]);
    expect(modes).toEqual([...GROUP_ORDER]);
    expect(modes).toHaveLength(23);
    expect(new Set(modes)).toEqual(new Set(modelApi.ALL_MODES));
    const numbers = [...markup.matchAll(/class="tab-number">(\d{2})</g)].map((match) => match[1]);
    expect(numbers).toEqual(Array.from({ length: 23 }, (_, index) => String(index + 1).padStart(2, "0")));
    expect(new Set(numbers).size).toBe(23);
  });

  it("6 grup doğru başlık, sıra ve üyelikle çerçevelenir; her sekmede viewed-mark var", () => {
    const groupMatches = [...markup.matchAll(/<div class="rhythm-group" role="group" aria-labelledby="([^"]+)">/g)];
    expect(groupMatches.map((match) => match[1])).toEqual([
      "rhythmGroup-sinus",
      "rhythmGroup-supra",
      "rhythmGroup-av",
      "rhythmGroup-vent",
      "rhythmGroup-conduction",
      "rhythmGroup-stt",
    ]);
    const titles = [...markup.matchAll(/class="rhythm-group-title" id="([^"]+)">([^<]+)</g)].map((match) => match[2]);
    expect(titles).toEqual([
      "Sinüs ritimleri",
      "Supraventriküler",
      "AV iletim ve kavşak",
      "Ventriküler",
      "İletim ve preeksitasyon",
      "ST-T ve metabolik paternler",
    ]);
    const expectedGroups = [
      ["normal", "sintach", "sinbrady"],
      ["pac", "pat", "svt", "af", "flutter"],
      ["avb1", "mobitz1", "mobitz2", "chb", "junctional"],
      ["pvc", "vt", "vf"],
      ["rbbb", "lbbb", "wpw"],
      ["stemi", "inferior", "pericarditis", "hyperk"],
    ] as const;
    for (const group of expectedGroups) {
      for (const mode of group) {
        const button = new RegExp(`data-mode="${mode}"[^>]*>.*?id="viewed-${mode}"`).test(markup);
        expect(button, mode).toBe(true);
      }
    }
    // Altıncı grupta "ritim" kelimesi geçmez (paternler ritim değildir).
    expect(titles[5]).not.toContain("ritim");
  });

  it("yeni sekmelerin adları ve ikincil satırları plandaki metinlerdir", () => {
    const expected: readonly (readonly [string, string, string])[] = [
      ["sinbrady", "Sinüs bradikardisi", "Yavaş sinüs ritmi"],
      ["avb1", "1. derece AV blok", "Uzun sabit PR"],
      ["mobitz1", "2. derece AV blok – Mobitz Tip I", "Wenckebach"],
      ["mobitz2", "2. derece AV blok – Mobitz Tip II", "Sabit PR, ani düşüş"],
      ["chb", "3. derece AV blok – Tam AV blok", "AV dissosiyasyon"],
      ["pac", "Atriyal erken atım (PAC)", "Erken farklı P"],
      ["junctional", "AV kavşak kaçış ritmi", "Dar QRS, önde P yok"],
      ["wpw", "Ventriküler preeksitasyon (WPW paterni)", "Kısa PR + delta"],
      ["pericarditis", "Akut perikardit EKG paterni", "Yaygın ST ↑, PR ↓"],
      ["hyperk", "Hiperkalemiye bağlı EKG paterni", "Sivri T"],
    ];
    for (const [mode, strong, small] of expected) {
      const button = new RegExp(`data-mode="${mode}"[\\s\\S]*?<strong>${escapeRegExp(strong)}</strong><small>${escapeRegExp(small)}</small>`).test(markup);
      expect(button, mode).toBe(true);
    }
  });
});

describe("T208 23 paterne geçiş — durum geriye uyumu", () => {
  it("eski 13 uzunluklu v dizisi çözülür, ilerleme korunur, yeni paternler 0 başlar", () => {
    const legacy = v6Record(modelApi.MODES.map(() => VIEW_MS));
    const decoded = stateApi.decode(legacy);
    expect(decoded.viewed["normal"]).toBe(16);
    expect(decoded.viewed["rbbb"]).toBe(16);
    for (const pattern of modelApi.PATTERN_MODES) expect(decoded.viewed[pattern], pattern).toBe(0);
    expect(Object.keys(decoded.viewed)).toHaveLength(23);
    const roundtrip = stateApi.encode(decoded);
    expect(roundtrip["v"]).toHaveLength(23);
    const again = stateApi.decode(roundtrip);
    expect(again.viewed["normal"]).toBe(16);
    expect(again.viewed["hyperk"]).toBe(0);
  });

  it("yeni patern indeksleri 13–22 aralığında ve eski indeksler değişmez", () => {
    const views = completeViews();
    expect(stateApi.decode({ ...v6Record(views), m: 12 }).mode).toBe("rbbb");
    expect(stateApi.decode({ ...v6Record(views), m: 13 }).mode).toBe("sinbrady");
    expect(stateApi.decode({ ...v6Record(views), m: 22 }).mode).toBe("hyperk");
    const decoded = stateApi.decode({ ...v6Record(views), v: [...views.slice(0, 22), 0] });
    expect(decoded.viewed["hyperk"]).toBe(0);
    expect(decoded.viewed["inferior"]).toBe(16);
  });
});

describe("T208 öğrenme kilidi", () => {
  it("22/23 patern izlenmişken uygulama ve değerlendirme kapalıdır", () => {
    const views = completeViews();
    views[22] = 0;
    const gates = stateApi.derive(stateApi.decode(v6Record(views, true)));
    expect(gates.simComplete).toBe(false);
    expect([gates.casesUnlocked, gates.quizUnlocked]).toEqual([false, false]);
  });

  it("23/23 patern ve gönderilmiş vakalarla kilit açılır", () => {
    const gates = stateApi.derive(stateApi.decode(v6Record(completeViews(), true)));
    expect([gates.simComplete, gates.casesUnlocked, gates.quizUnlocked]).toEqual([true, true, true]);
  });

  it("23/23 patern izlense de vakalar gönderilmeden değerlendirme açılmaz (mevcut kural)", () => {
    const gates = stateApi.derive(stateApi.decode(v6Record(completeViews())));
    expect([gates.simComplete, gates.casesUnlocked, gates.quizUnlocked]).toEqual([true, true, false]);
  });
});

describe("T208 müfredat kaynak ve sınırlılık metni", () => {
  it("10 yeni patern için etiket, kaynak ve derivasyon haritaları tanımlıdır", () => {
    const labels = curriculumApi.labels;
    expect(labels["sinbrady"]).toBe("Sinüs bradikardisi");
    expect(labels["mobitz1"]).toBe("2. derece AV blok – Mobitz Tip I");
    expect(labels["junctional"]).toBe("AV kavşak kaçış ritmi");
    expect(labels["pericarditis"]).toBe("Akut perikardit EKG paterni");
    expect(labels["hyperk"]).toBe("Hiperkalemiye bağlı EKG paterni");

    const modeSources = vendorObject("modeSources");
    expect(modeSources["sinbrady"]).toEqual(["BRADY2018"]);
    expect(modeSources["mobitz2"]).toEqual(["BRADY2018"]);
    expect(modeSources["pac"]).toEqual(["ECG2007", "PAC2019"]);
    expect(modeSources["junctional"]).toEqual(["BRADY2018", "ECG2007"]);
    expect(modeSources["wpw"]).toEqual(["ECG2007", "SVT2019"]);
    expect(modeSources["pericarditis"]).toEqual(["PERI2025"]);
    expect(modeSources["hyperk"]).toEqual(["MON2017"]);

    const leads = vendorObject("leads");
    expect(leads["sinbrady"]).toEqual(["II", "aVF", "V1"]);
    expect(leads["junctional"]).toEqual(["II", "aVR", "V1"]);
    expect(leads["wpw"]).toEqual(["II", "aVF", "V4"]);
    expect(leads["pericarditis"]).toEqual(["II", "aVR", "V5"]);
    expect(leads["hyperk"]).toEqual(["II", "aVF", "V3"]);
  });

  it("sınırlılık metni gerçek sayıyı ve 14–23 onay bekliyor cümlesini taşır", () => {
    expect(curriculumApi.limitations).toContain("23 EKG sonucu");
    expect(curriculumApi.limitations).toContain("ilk 13 EKG sonucunun");
    expect(curriculumApi.limitations).toContain("Patern 14–23 (T204) sinyal ve içerikleri Kardiyoloji ABD onayı bekliyor.");
  });

  it("sources.json yeni DOI kayıtlarını içerir", () => {
    const sources = JSON.parse(readFileSync("packages/sim-pulse/src/data/sources.json", "utf8")) as {
      references: readonly { id: string; url: string }[];
    };
    const byId = Object.fromEntries(sources.references.map((reference) => [reference.id, reference.url]));
    expect(byId["BRADY2018"]).toBe("https://doi.org/10.1161/CIR.0000000000000628");
    expect(byId["ECG2007"]).toBe("https://doi.org/10.1161/CIRCULATIONAHA.106.180201");
    expect(byId["PERI2025"]).toBe("https://doi.org/10.1093/eurheartj/ehaf192");
    expect(byId["MON2017"]).toBe("https://doi.org/10.1161/CIR.0000000000000527");
    expect(byId["PAC2019"]).toBe("https://doi.org/10.1016/j.hlc.2019.03.005");
  });
});
