import { describe, expect, it } from "vitest";
import { buildSuspend, computeCaseResult, fromServerResult, initialState, initialTelemetry, reducer } from "../../../packages/sim-opaca/src/index";
import type { AppState, ServerClientCase } from "../../../packages/sim-opaca/src/index";
import { ALL_CASES } from "../bank-cases";
import { caseResult, publicCase, SESSION_OPENED_AT } from "../session-fixture";
import { toClientCase } from "../../../packages/sim-opaca/src/index";

/** Reducer grubu — kaynak egemed-opaca tests/core.test.ts `describe('reducer')` portu.
 *  A2.3 (ADR-009): vaka çözümleme sunucu durumundan okunur; yerel vaka havuzu yoktur. */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const imageUrl = (id: string, token: string) => `/api/sims/opaca/sessions/${id}/image/${token}`;
const serverCase = () => toClientCase(publicCase(1), "practice", SESSION_ID, imageUrl);

describe("reducer (kaynak davranışı)", () => {
  const s0: AppState = { ...initialState };

  it("startMode odak bulgusunu ve düello kimliğini taşır", () => {
    const focused = reducer(s0, { type: "startMode", mode: "practice", focusFinding: "nodule_mass" });
    expect(focused.serverFocus).toBe("nodule_mass");
    const challenge = reducer(s0, { type: "startMode", mode: "assessment", challengeId: "ch-1" });
    expect(challenge.serverChallengeId).toBe("ch-1");
    expect(challenge.serverFocus).toBeNull();
  });

  it("bölge girişi sırayı bir kez kaydeder, süre birikir", () => {
    let s = reducer(s0, { type: "zoneEnter", zoneIds: ["a_trachea"] });
    s = reducer(s, { type: "zoneEnter", zoneIds: ["a_trachea", "c_heart"] });
    s = reducer(s, { type: "zoneDwell", zoneIds: ["a_trachea"], dwellMs: 250 });
    s = reducer(s, { type: "zoneDwell", zoneIds: ["a_trachea", "e_bones"], dwellMs: 250 });
    expect(s.telemetry.order).toEqual(["a_trachea", "c_heart", "e_bones"]);
    expect(s.telemetry.visits.a_trachea).toEqual({ dwellMs: 500, visits: 2, firstOrder: 0 });
    expect(s.telemetry.visits.e_bones?.firstOrder).toBe(2);
    expect(reducer(s, { type: "zoneDwell", zoneIds: [], dwellMs: 250 })).toBe(s);
  });

  it("restore yalnız aktif modun listesine yazar (K3)", () => {
    const start: AppState = { ...s0, session: { practiceIds: ["p1"], assessmentIds: ["a1"], seed: 1 } };
    const payload = buildSuspend({
      ...start,
      mode: "assessment",
      session: { practiceIds: ["x"], assessmentIds: ["a9", "a8"], seed: 7 },
    });
    const s = reducer(start, { type: "restore", payload });
    expect(s.session).toEqual({ practiceIds: ["p1"], assessmentIds: ["a9", "a8"], seed: 7 });
    expect(s.screen).toBe("simulation");
    expect(s.tutorialSeen).toBe(true);
  });

  it("sunucu akışı: vaka yükleme, sonuç ve bitiş oturum durumunu günceller", () => {
    const clientCase = serverCase();
    let s = reducer(s0, { type: "startMode", mode: "practice" });
    s = reducer(s, { type: "serverStarted", sessionId: SESSION_ID, mode: "practice", caseCount: 2, perCaseLimitMs: null });
    expect(s.server?.status).toBe("loading");
    s = reducer(s, { type: "serverCaseLoaded", index: 1, clientCase });
    expect(s.currentCaseId).toBe("srv-1");
    expect(s.server?.status).toBe("ready");
    expect(s.server?.cases["srv-1"]).toBe(clientCase);
    s = reducer(s, { type: "serverSnapshot", caseId: "srv-1", snapshot: { title: "Vaka 1", questions: [], given: { q1: ["opt-a-1000"] } } });
    s = reducer(s, { type: "serverSubmitting" });
    expect(s.server?.status).toBe("submitting");
    s = reducer(s, { type: "serverCaseResult", result: { ...fromServerResult(caseResult(1)).result, caseId: "srv-1" }, meta: { title: "T", diagnosis: null, summary: "S" } });
    expect(s.server?.status).toBe("ready");
    expect(s.pendingSummary?.caseId).toBe("srv-1");
    expect(s.caseResults).toHaveLength(1);
    // snapshot'taki verilen yanıt sonuca işlenir
    expect(s.caseResults[0]?.answers[0]?.given).toEqual(["opt-a-1000"]);
    s = reducer(s, { type: "nextCase" });
    expect(s.pendingSummary).toBeNull();
    expect(s.caseIndex).toBe(1);
    expect(s.caseElapsed).toBe(0);
    expect(s.telemetry.order).toEqual([]);
  });

  it("advance yalnız yüklü sunucu vakasında ilerler (son soruda durur)", () => {
    const clientCase: ServerClientCase = serverCase();
    let s = reducer(s0, { type: "serverCaseLoaded", index: 1, clientCase });
    for (let i = 0; i < clientCase.questions.length + 2; i++) s = reducer(s, { type: "advance" });
    expect(s.step).toBe(clientCase.questions.length - 1);
  });

  it("uygulamada ipucu cezası vaka sonucuna yansır", () => {
    const def = ALL_CASES[0];
    expect(def).toBeDefined();
    if (!def) return;
    const correct = Object.fromEntries(def.questions.map((q) => [q.id, q.correct]));
    const full = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 0, mode: "practice" });
    const hinted = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 1, mode: "practice" });
    const assess = computeCaseResult(def, { answers: correct, telemetry: initialTelemetry(), hintsUsed: 1, mode: "assessment" });
    expect(hinted.total).toBe(Math.max(0, full.total - 5));
    expect(assess.total).toBe(full.total);
  });

  it("openedAt public vakadan gelir; yerel vaka kimliği sızmaz", () => {
    const publicEntry = publicCase(1);
    expect(publicEntry.openedAt).toBe(SESSION_OPENED_AT);
    expect(serverCase().title).not.toContain("pnömotoraks");
  });
});
