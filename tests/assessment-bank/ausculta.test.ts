import ts from "typescript";
import { describe, expect, it } from "vitest";
import { auscultaPublicCaseSchema, caseResultSchema } from "../../packages/contracts/src/index";
import { ausculta } from "../../packages/assessment-bank/src/index";

// A1.2 (ADR-009): anahtarsız projeksiyon hiçbir vakada anahtar/tanı/ses yolu sızdırmaz;
// sunucu notlandırması jetonlu yanıtı doğru puanlar; paket istemci yollarına girmez.

let counter = 0;
const newToken = () => `tok_${(counter++).toString(36).padStart(10, "0")}`;
const random = () => 0.42;
const EMPTY_TELEMETRY = { visits: {}, order: [], headChanges: 0, headUse: { bell: 0, diaphragm: 0 }, replayCount: 0 };

const allCases = [...new Map([...ausculta.poolFor("practice"), ...ausculta.poolFor("assessment")].map((c) => [c.id, c])).values()];

describe("anahtarsız projeksiyon — tüm vakalar", () => {
  it("havuzlar dolu (uygulama ≥ değerlendirme)", () => {
    expect(ausculta.poolFor("practice").length).toBeGreaterThan(100);
    expect(ausculta.poolFor("assessment").length).toBeGreaterThan(50);
  });

  for (const mode of ["practice", "assessment"] as const) {
    it(`${mode}: her vaka sözleşmeye uyar ve sızıntı taşımaz`, () => {
      const pool = ausculta.poolFor(mode);
      for (const caseDef of pool) {
        const { publicCase } = ausculta.buildPublicCase(caseDef, { index: 1, mode, openedAt: "2026-09-27T10:00:00.000+03:00", newToken, random });
        const parsed = auscultaPublicCaseSchema.safeParse(publicCase);
        expect(parsed.success, `${caseDef.id}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe(true);
        const json = JSON.stringify(publicCase);
        expect(json, caseDef.id).not.toContain(caseDef.id);
        // Başlık bir seçenek etiketiyle aynı olabilir (ör. "Wheezing"); seçenekler dışındaki alanlarda aranır.
        const withoutOptions = JSON.stringify({ ...publicCase, questions: publicCase.questions.map((q) => ({ ...q, options: [] })) });
        expect(withoutOptions, caseDef.id).not.toContain(`"${caseDef.title}"`);
        expect(json, caseDef.id).not.toMatch(/\.wav|runtime\/|acousticFinding|"correct"|feedback|hls-cmds/);
        for (const objective of caseDef.objectives) expect(withoutOptions, caseDef.id).not.toContain(objective);
        expect(json, caseDef.id).not.toContain(caseDef.feedback.summary);
        for (const q of caseDef.questions) {
          if (q.hint !== undefined && q.hint !== q.help) expect(json, `${caseDef.id}/${q.id}`).not.toContain(q.hint);
          // Özgün seçenek kimlikleri (a, b, c…) gitmez; yalnız opak jeton.
          for (const option of publicCase.questions.find((pq) => pq.id === q.id)?.options ?? []) expect(option.id.startsWith("tok_")).toBe(true);
        }
      }
    });
  }

  it("değerlendirmede ipucu yok; uygulamada ipucu olan sorular işaretli", () => {
    const withHint = allCases.find((c) => c.modes.includes("assessment") && c.questions.some((q) => (q.hint ?? "").length > 0));
    expect(withHint).toBeDefined();
    if (withHint === undefined) return;
    const assess = ausculta.buildPublicCase(withHint, { index: 1, mode: "assessment", openedAt: "2026-09-27T10:00:00.000+03:00", newToken, random });
    const practice = ausculta.buildPublicCase(withHint, { index: 1, mode: "practice", openedAt: "2026-09-27T10:00:00.000+03:00", newToken, random });
    expect(assess.publicCase.questions.every((q) => !q.hintAvailable)).toBe(true);
    expect(practice.publicCase.questions.some((q) => q.hintAvailable)).toBe(true);
  });
});

describe("sunucu notlandırması", () => {
  const caseDef = allCases.find((c) => c.questions.length >= 2) ?? allCases[0];
  it("doğru jetonlarla tüm soru alanları tam; yanlışla sıfır; geri bildirim sözleşmeye uyar", () => {
    if (caseDef === undefined) throw new Error("vaka yok");
    const { publicCase, keys } = ausculta.buildPublicCase(caseDef, { index: 2, mode: "practice", openedAt: "2026-09-27T10:00:00.000+03:00", newToken, random });
    const correctAnswers = Object.fromEntries(
      caseDef.questions.map((q) => [q.id, q.correct.map((optionId) => Object.keys(keys.options[q.id] ?? {}).find((token) => keys.options[q.id]?.[token] === optionId) ?? "")]),
    );
    const good = ausculta.gradeCase(caseDef, keys, { index: 2, mode: "practice", answers: correctAnswers, telemetry: EMPTY_TELEMETRY, hintsUsed: 0 });
    expect(caseResultSchema.safeParse(good).success).toBe(true);
    expect(good.questions.every((q) => q.correct)).toBe(true);
    const wrongAnswers = Object.fromEntries(
      publicCase.questions.map((q) => [q.id, [q.options.find((o) => !(correctAnswers[q.id] ?? []).includes(o.id))?.id ?? ""]]),
    );
    const bad = ausculta.gradeCase(caseDef, keys, { index: 2, mode: "practice", answers: wrongAnswers, telemetry: EMPTY_TELEMETRY, hintsUsed: 0 });
    expect(bad.questions.every((q) => !q.correct)).toBe(true);
    expect(bad.total).toBeLessThan(good.total);
    // Doğru seçenekler jetonla döner (özgün kimlik değil).
    expect(good.questions[0]?.correctOptionIds.every((id) => id.startsWith("tok_"))).toBe(true);
  });

  it("tanınmayan jeton puan getirmez", () => {
    if (caseDef === undefined) throw new Error("vaka yok");
    const { keys } = ausculta.buildPublicCase(caseDef, { index: 1, mode: "assessment", openedAt: "2026-09-27T10:00:00.000+03:00", newToken, random });
    const forged = Object.fromEntries(caseDef.questions.map((q) => [q.id, q.correct]));
    const result = ausculta.gradeCase(caseDef, keys, { index: 1, mode: "assessment", answers: forged, telemetry: EMPTY_TELEMETRY, hintsUsed: 0 });
    expect(result.questions.every((q) => !q.correct)).toBe(true);
  });

  it("odaklı uygulama oturumu yalnız o bulgudan en fazla 5 vaka seçer", () => {
    const finding = ausculta.poolFor("practice")[0]?.primaryAcousticFinding ?? "normal";
    const ids = ausculta.selectCaseIds("practice", () => 0.3, ausculta.FOCUS_CASE_COUNT, finding);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(5);
    for (const id of ids) expect(ausculta.caseById(id)?.primaryAcousticFinding).toBe(finding);
  });

  it("oturum seçimi havuzdan tekrar etmeyen 10 vaka verir", () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ids = ausculta.selectCaseIds("assessment", rnd);
    expect(ids).toHaveLength(ausculta.SESSION_CASE_COUNT);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(ausculta.caseById(id)?.modes).toContain("assessment");
  });
});

describe("paket sınırı", () => {
  it("sim paketleri ve kabuk üretim yolu assessment-bank içe aktarmaz", () => {
    const files = [
      ...ts.sys.readDirectory("packages", [".ts", ".tsx"]).filter((f) => /packages\/sim-/.test(f)),
      ...ts.sys.readDirectory("apps/shell/src", [".ts", ".tsx"]),
    ].filter((f) => !f.includes("node_modules"));
    // İzin: kabuğun DEV kapılı yerel oturum kaynağı (A1.4) — `devLocalSessions` adlı dosya.
    const offenders = files.filter((f) => !/devLocalSessions/.test(f) && (ts.sys.readFile(f) ?? "").includes("@egemed/assessment-bank"));
    expect(offenders).toEqual([]);
  });

  it("T196: istemci kaynağı anahtarlı vaka dosyalarını içe aktarmaz", () => {
    const files = [
      ...ts.sys.readDirectory("packages", [".ts", ".tsx"]).filter((f) => /packages\/sim-ausculta\/src\//.test(f)),
      ...ts.sys.readDirectory("apps/shell/src", [".ts", ".tsx"]),
    ].filter((f) => !f.includes("node_modules"));
    const offenders = files.filter((f) => /cases(-auto)?\.json/.test(ts.sys.readFile(f) ?? ""));
    expect(offenders).toEqual([]);
  });
});

describe("istemci envanteri (A1.4)", () => {
  it("sim paketindeki case-inventory.json bankayla birebir aynı ve yalnız sayı taşır", () => {
    const client = JSON.parse(ts.sys.readFile("packages/sim-ausculta/src/data/case-inventory.json") ?? "{}") as unknown;
    expect(client).toEqual(JSON.parse(JSON.stringify(ausculta.caseInventory())));
    const raw = ts.sys.readFile("packages/sim-ausculta/src/data/case-inventory.json") ?? "";
    expect(raw).not.toMatch(/case_|"correct"|title|\.wav/);
  });
});
