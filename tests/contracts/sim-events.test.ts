import { describe, expect, it } from "vitest";
import {
  SIM_IDS,
  mapAuscultaEvent,
  mapOpacaEvent,
  mapPulseEvent,
  simEventSchema,
} from "../../packages/contracts/src/index";
import type { SimId } from "../../packages/contracts/src/index";
import { SIMULATOR_IDS } from "../../packages/sim-host/src/index";
import type { SimulatorId } from "../../packages/sim-host/src/index";

const ISO = "2026-09-24T13:00:00.000+03:00";

/** İki birlik tipinin birebir aynı olduğunu derleme zamanında doğrular. */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const simIdTypesMatch: Equal<SimId, SimulatorId> = true;

describe("sim olay sözlüğü şeması", () => {
  it("geçerli sözlük olaylarını kabul eder", () => {
    const samples = [
      { event: "sim_started", simId: "pulse", occurredAt: ISO },
      { event: "mode_selected", simId: "ausculta", occurredAt: ISO, modeCode: "practice" },
      {
        event: "interaction",
        simId: "opaca",
        occurredAt: ISO,
        interactionCode: "tool_used",
        valueCode: "zoom",
      },
      {
        event: "answer_submitted",
        simId: "opaca",
        occurredAt: ISO,
        questionCode: "q1",
        isCorrect: true,
      },
      {
        event: "case_completed",
        simId: "ausculta",
        occurredAt: ISO,
        caseCode: "case-01",
        modeCode: "assessment",
      },
      {
        event: "session_completed",
        simId: "pulse",
        occurredAt: ISO,
        completionCode: "passed",
        totalScore: 85,
      },
      {
        event: "sim_exited",
        simId: "pulse",
        occurredAt: ISO,
        reasonCode: "session_reset",
      },
    ] as const;

    for (const sample of samples) {
      expect(simEventSchema.safeParse(sample).success, sample.event).toBe(true);
    }
  });

  it("bilinmeyen alanı, bilinmeyen simId'yi ve serbest metin benzeri modu reddeder", () => {
    expect(
      simEventSchema.safeParse({ event: "sim_started", simId: "pulse", occurredAt: ISO, extra: 1 }).success,
    ).toBe(false);
    expect(simEventSchema.safeParse({ event: "sim_started", simId: "kalp", occurredAt: ISO }).success).toBe(false);
    expect(
      simEventSchema.safeParse({
        event: "mode_selected",
        simId: "pulse",
        occurredAt: ISO,
        modeCode: "öğrenme modu",
      }).success,
    ).toBe(false);
  });

  it("şema anahtarlarında PII alan adları taşımaz", () => {
    const allKeys = simEventSchema.options.flatMap((option) => Object.keys(option.shape));
    expect(allKeys.some((key) => /name|email|username/i.test(key))).toBe(false);
  });
});

describe("simId birlik drift koruması", () => {
  it("contracts SimId, sim-host SimulatorId ile birebir aynıdır", () => {
    expect(simIdTypesMatch).toBe(true);
    expect(SIM_IDS).toEqual(SIMULATOR_IDS);
  });
});

describe("sim iç olay eşlemeleri", () => {
  it("opaca ve ausculta olaylarını sözlüğe çevirir", () => {
    const opaca = mapOpacaEvent(
      { type: "case_completed", caseId: "case-17", mode: "assessment", at: 1727172300000 },
      ISO,
    );
    const ausculta = mapAuscultaEvent(
      { type: "answer_submitted", qid: "q2", correct: false, at: 1727172300000 },
      ISO,
    );

    expect(opaca).toEqual({
      event: "case_completed",
      simId: "opaca",
      occurredAt: ISO,
      caseCode: "case-17",
      modeCode: "assessment",
    });
    expect(ausculta).toEqual({
      event: "answer_submitted",
      simId: "ausculta",
      occurredAt: ISO,
      questionCode: "q2",
      isCorrect: false,
    });
    expect(simEventSchema.safeParse(opaca).success).toBe(true);
    expect(simEventSchema.safeParse(ausculta).success).toBe(true);
  });

  it("pulse olaylarını sözlüğe çevirir ve geçersiz modu null döndürür", () => {
    const mode = mapPulseEvent({ name: "cardai:mode", payload: { mode: "af" } }, ISO);
    const session = mapPulseEvent({ name: "cardai:session", payload: { passed: true, score: 92 } }, ISO);
    const reset = mapPulseEvent({ name: "cardai:reset", payload: null }, ISO);
    const invalid = mapPulseEvent({ name: "cardai:mode", payload: { mode: "serbest metin" } }, ISO);

    expect(mode).toEqual({ event: "mode_selected", simId: "pulse", occurredAt: ISO, modeCode: "af" });
    expect(session).toEqual({
      event: "session_completed",
      simId: "pulse",
      occurredAt: ISO,
      completionCode: "passed",
      totalScore: 92,
    });
    expect(reset).toEqual({
      event: "sim_exited",
      simId: "pulse",
      occurredAt: ISO,
      reasonCode: "session_reset",
    });
    expect(invalid).toBeNull();
  });
});
