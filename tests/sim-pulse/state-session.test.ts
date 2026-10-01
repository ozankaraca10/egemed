import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * T220 (A3.4, ADR-009): Sunucu oturumunda yerel madde örneklemi yoktur; oturum
 * yalnız 10 yuvadır (C1–C10 / Q1–Q10) ve cevap anahtarı istemcide tutulmaz.
 * Eski C/Q kimlikli yerel kayıtlar güvenle yok sayılır (yeni boş oturum).
 */

const VENDOR = "packages/sim-pulse/src/runtime/vendor";

function runVendorFunction(path: string): (env: Record<string, unknown>) => void {
  const source = readFileSync(path, "utf8").replace("export default function run", "return function run");
  return new Function("module", source)(undefined) as (env: Record<string, unknown>) => void;
}

interface SessionShape {
  id: string;
  ids: string[];
  answers: (number | null)[];
  submitted: boolean[];
  leadSelections: string[][];
  interactionIndices: (number | null)[];
}

interface StateShape {
  version: number;
  viewed: Record<string, number>;
  caseSession: SessionShape;
  quizSession: SessionShape;
  bestAttempt: SessionShape | null;
  bestCaseAttempt: SessionShape | null;
  currentCase: number;
  quizPage: number;
  returnContext: { sessionId: string; itemId: string; index: number } | null;
}

interface Gates {
  readonly casesComplete: boolean;
  readonly casesUnlocked: boolean;
  readonly quizUnlocked: boolean;
}

interface StateApi {
  blank(): StateShape;
  decode(raw: unknown): StateShape;
  encode(state: StateShape): Record<string, unknown>;
  derive(state: StateShape): Gates;
  attemptScore(session: SessionShape): number | null;
}

const win: Record<string, unknown> = {};
runVendorFunction(`${VENDOR}/model.js`)({ window: win });
win["CardAIScorm"] = { previousStatus: "" };
runVendorFunction(`${VENDOR}/curriculum.js`)({ window: win });
runVendorFunction(`${VENDOR}/state.js`)({ window: win });

const stateApi = win["PulseState"] as StateApi;
const curriculum = win["PulseCurriculum"] as { readonly version: number };

const sessionRecord = (n: readonly number[], submitted: boolean): Record<string, unknown> => ({
  i: "egemed-yerel-oturum-001",
  n: [...n],
  a: n.map(() => 0),
  s: submitted ? 1023 : 0,
  l: n.map(() => [0, 0, 0]),
  x: n.map(() => -1),
});

function record(caseSession: Record<string, unknown>, quizSession: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 6,
    cv: curriculum.version,
    m: 0,
    t: 2,
    p: 1,
    f: 0,
    v: Array.from({ length: 23 }, () => 60_000),
    u: 4,
    c: caseSession,
    q: quizSession,
  };
}

describe("Pulse yerel oturum — madde kimliği yerine yuvalar (T220)", () => {
  it("boş oturum 10 yuva taşır; encode yuva sırasını yazar", () => {
    const state = stateApi.blank();
    expect(state.caseSession.ids).toEqual(Array.from({ length: 10 }, (_, i) => `C${i + 1}`));
    expect(state.quizSession.ids).toEqual(Array.from({ length: 10 }, (_, i) => `Q${i + 1}`));
    expect(state.caseSession.answers.every((answer) => answer === null)).toBe(true);
    const encoded = stateApi.encode(state).c as { n: number[] };
    expect(encoded.n).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("yuva oturumu yanıt/gönderim/derivasyon seçimleriyle gidiş-dönüş korunur", () => {
    const state = stateApi.blank();
    state.quizSession.answers[0] = 3;
    state.quizSession.submitted[0] = true;
    state.quizSession.leadSelections[0] = ["V3", "V4", "V5"];
    state.caseSession.answers[4] = 1;
    state.caseSession.submitted[4] = true;
    const restored = stateApi.decode(stateApi.encode(state));
    expect(restored.quizSession.ids).toEqual(state.quizSession.ids);
    expect([restored.quizSession.answers[0], restored.quizSession.submitted[0]]).toEqual([3, true]);
    expect(restored.quizSession.leadSelections[0]).toEqual(["V3", "V4", "V5"]);
    expect([restored.caseSession.answers[4], restored.caseSession.submitted[4]]).toEqual([1, true]);
    expect(restored.caseSession.answers.filter((answer) => answer !== null)).toHaveLength(1);
  });

  it("eski C/Q kimlikli yerel kayıtlar güvenle yok sayılır (yeni boş oturum)", () => {
    const legacy = stateApi.decode(
      record(sessionRecord([191, 192, 193, 194, 195, 196, 197, 198, 199, 200], true), sessionRecord([57, 134, 12, 220, 5, 189, 78, 42, 512, 9], true)),
    );
    expect(legacy.caseSession.ids).toEqual(Array.from({ length: 10 }, (_, i) => `C${i + 1}`));
    expect(legacy.quizSession.ids).toEqual(Array.from({ length: 10 }, (_, i) => `Q${i + 1}`));
    expect(legacy.caseSession.answers.every((answer) => answer === null)).toBe(true);
    expect(legacy.caseSession.submitted.every((on) => !on)).toBe(true);
    expect(legacy.quizSession.submitted.every((on) => !on)).toBe(true);
  });

  it("eski madde anahtarlı en iyi denemeler geri yüklenmez; yuva kaydı yüklenir", () => {
    const legacyBest = {
      ...record(sessionRecord([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true), sessionRecord([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false)),
      b: sessionRecord([191, 192, 193, 194, 195, 196, 197, 198, 199, 200], true),
    };
    const decodedLegacy = stateApi.decode(legacyBest);
    expect(decodedLegacy.bestAttempt).toBeNull();
    const slotBest = {
      ...record(sessionRecord([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false), sessionRecord([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], false)),
      b: sessionRecord([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true),
    };
    const decodedSlot = stateApi.decode(slotBest);
    expect(decodedSlot.bestAttempt?.ids).toEqual(Array.from({ length: 10 }, (_, i) => `Q${i + 1}`));
  });

  it("yerel cevap anahtarı olmadığından doğruluk/puan hesaplanmaz; gönderim kapıları korunur", () => {
    const state = stateApi.decode(record(sessionRecord([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true), sessionRecord([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true)));
    expect(stateApi.attemptScore(state.quizSession)).toBe(0);
    const gates = stateApi.derive(state);
    expect([gates.casesComplete, gates.casesUnlocked, gates.quizUnlocked]).toEqual([true, true, true]);
  });

  it("dönüş bağlamı yalnız gönderilmiş yuvada ve yuva indeksiyle geri yüklenir", () => {
    const state = stateApi.blank();
    state.caseSession.answers[2] = 4;
    state.caseSession.submitted[2] = true;
    state.returnContext = { sessionId: state.caseSession.id, itemId: "Vaka 3", index: 2 };
    const restored = stateApi.decode(stateApi.encode(state));
    expect(restored.returnContext).toEqual({ sessionId: state.caseSession.id, itemId: "Vaka 3", index: 2 });

    const notSubmitted = stateApi.blank();
    notSubmitted.returnContext = { sessionId: notSubmitted.caseSession.id, itemId: "Vaka 3", index: 2 };
    expect(stateApi.decode(stateApi.encode(notSubmitted)).returnContext).toBeNull();
  });
});
