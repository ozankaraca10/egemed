import { z } from "zod";
import { isoDateTimeSchema, simIdSchema } from "./schemas/common";

export const SIM_EVENT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

const simEventCodeSchema = z.string().regex(SIM_EVENT_CODE_PATTERN);

export const SIM_EVENT_NAMES = [
  "sim_started",
  "mode_selected",
  "interaction",
  "answer_submitted",
  "case_completed",
  "session_completed",
  "sim_exited",
] as const;

export type SimEventName = (typeof SIM_EVENT_NAMES)[number];

export const MODE_CODES = [
  "learn",
  "practice",
  "assessment",
  "normal",
  "af",
  "stemi",
  "pvc",
  "svt",
  "inferior",
  "vt",
  "vf",
  "pat",
  "flutter",
  "sintach",
  "lbbb",
  "rbbb",
] as const;

export type ModeCode = (typeof MODE_CODES)[number];

export const INTERACTION_CODES = [
  "zone_visited",
  "tool_used",
  "mark_placed",
  "answer_selected",
  "hint_used",
  "case_timeout",
  "view_changed",
  "point_visited",
  "auscultation_started",
  "auscultation_stopped",
  "filter_changed",
  "sound_replayed",
  "tick",
] as const;

export type InteractionCode = (typeof INTERACTION_CODES)[number];

export const SESSION_COMPLETION_CODES = ["completed", "passed", "failed"] as const;
export type SessionCompletionCode = (typeof SESSION_COMPLETION_CODES)[number];

export const SIM_EXIT_REASONS = ["session_reset", "host_dispose", "window_closed"] as const;
export type SimExitReason = (typeof SIM_EXIT_REASONS)[number];

const modeCodeSchema = z.enum(MODE_CODES);
const interactionCodeSchema = z.enum(INTERACTION_CODES);
const sessionCompletionCodeSchema = z.enum(SESSION_COMPLETION_CODES);
const simExitReasonSchema = z.enum(SIM_EXIT_REASONS);

const simEventBaseSchema = {
  simId: simIdSchema,
  occurredAt: isoDateTimeSchema,
};

export const simStartedEventSchema = z.strictObject({
  ...simEventBaseSchema,
  event: z.literal("sim_started"),
});

export const modeSelectedEventSchema = z.strictObject({
  ...simEventBaseSchema,
  event: z.literal("mode_selected"),
  modeCode: modeCodeSchema,
});

export const interactionEventSchema = z.strictObject({
  ...simEventBaseSchema,
  event: z.literal("interaction"),
  interactionCode: interactionCodeSchema,
  targetCode: simEventCodeSchema.optional(),
  valueCode: simEventCodeSchema.optional(),
});

export const answerSubmittedEventSchema = z.strictObject({
  ...simEventBaseSchema,
  event: z.literal("answer_submitted"),
  questionCode: simEventCodeSchema,
  isCorrect: z.boolean(),
});

export const caseCompletedEventSchema = z.strictObject({
  ...simEventBaseSchema,
  event: z.literal("case_completed"),
  caseCode: simEventCodeSchema,
  modeCode: modeCodeSchema,
});

export const sessionCompletedEventSchema = z.strictObject({
  ...simEventBaseSchema,
  event: z.literal("session_completed"),
  completionCode: sessionCompletionCodeSchema,
  totalScore: z.number().int().min(0).optional(),
});

export const simExitedEventSchema = z.strictObject({
  ...simEventBaseSchema,
  event: z.literal("sim_exited"),
  reasonCode: simExitReasonSchema,
});

export const simEventSchema = z.discriminatedUnion("event", [
  simStartedEventSchema,
  modeSelectedEventSchema,
  interactionEventSchema,
  answerSubmittedEventSchema,
  caseCompletedEventSchema,
  sessionCompletedEventSchema,
  simExitedEventSchema,
]);

export const simEventListSchema = z.array(simEventSchema);

export type SimEvent = z.infer<typeof simEventSchema>;

export type OpacaSourceEvent =
  | { type: "simulation_started"; at: number }
  | { type: "case_started"; caseId: string; mode: "learn" | "practice" | "assessment"; at: number }
  | { type: "zone_visited"; zoneId: string; at: number }
  | { type: "tool_used"; tool: "zoom" | "window" | "invert" | "overlay" | "measure"; at: number }
  | { type: "mark_placed"; qid: string; at: number }
  | { type: "answer_selected"; qid: string; at: number }
  | { type: "answer_submitted"; qid: string; correct: boolean; at: number }
  | { type: "hint_used"; caseId: string; at: number }
  | { type: "case_timeout"; caseId: string; at: number }
  | { type: "case_completed"; caseId: string; mode: "learn" | "practice" | "assessment"; at: number }
  | { type: "assessment_completed"; total: number; at: number };

export const OPACA_EVENT_MAP = {
  simulation_started: "sim_started",
  case_started: "mode_selected",
  zone_visited: "interaction",
  tool_used: "interaction",
  mark_placed: "interaction",
  answer_selected: "interaction",
  answer_submitted: "answer_submitted",
  hint_used: "interaction",
  case_timeout: "interaction",
  case_completed: "case_completed",
  assessment_completed: "session_completed",
} as const satisfies Record<OpacaSourceEvent["type"], SimEventName>;

export type AuscultaSourceEvent =
  | { type: "simulation_started"; at: number }
  | { type: "case_started"; caseId: string; mode: "learn" | "practice" | "assessment"; at: number }
  | { type: "view_changed"; view: "front" | "back"; at: number }
  | { type: "point_visited"; pointId: string; at: number; dwellMs: number }
  | { type: "auscultation_started"; pointId: string; at: number }
  | { type: "auscultation_stopped"; pointId: string; listenMs: number; at: number }
  | { type: "filter_changed"; head: "bell" | "diaphragm"; at: number }
  | { type: "sound_replayed"; pointId: string; at: number }
  | { type: "answer_selected"; qid: string; at: number }
  | { type: "answer_submitted"; qid: string; correct: boolean; at: number }
  | { type: "hint_used"; caseId: string; at: number }
  | { type: "case_completed"; caseId: string; mode: "learn" | "practice" | "assessment"; at: number }
  | { type: "assessment_completed"; total: number; at: number };

export const AUSCULTA_EVENT_MAP = {
  simulation_started: "sim_started",
  case_started: "mode_selected",
  view_changed: "interaction",
  point_visited: "interaction",
  auscultation_started: "interaction",
  auscultation_stopped: "interaction",
  filter_changed: "interaction",
  sound_replayed: "interaction",
  answer_selected: "interaction",
  answer_submitted: "answer_submitted",
  hint_used: "interaction",
  case_completed: "case_completed",
  assessment_completed: "session_completed",
} as const satisfies Record<AuscultaSourceEvent["type"], SimEventName>;

export type PulseModeCode = Exclude<ModeCode, "learn" | "practice" | "assessment">;

export type PulseSourceEvent =
  | { name: "cardai:tick"; payload: unknown }
  | { name: "cardai:mode"; payload: { mode: unknown } }
  | { name: "cardai:view"; payload: { view: unknown } }
  | { name: "cardai:session"; payload: unknown }
  | { name: "cardai:reset"; payload: unknown };

export const PULSE_EVENT_MAP = {
  "cardai:tick": "interaction",
  "cardai:mode": "mode_selected",
  "cardai:view": "interaction",
  "cardai:session": "session_completed",
  "cardai:reset": "sim_exited",
} as const satisfies Record<PulseSourceEvent["name"], SimEventName>;

const pulseModeCodeSet = new Set<string>([
  "normal",
  "af",
  "stemi",
  "pvc",
  "svt",
  "inferior",
  "vt",
  "vf",
  "pat",
  "flutter",
  "sintach",
  "lbbb",
  "rbbb",
]);

function isPulseModeCode(value: unknown): value is PulseModeCode {
  return typeof value === "string" && pulseModeCodeSet.has(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asCode(value: unknown): string | undefined {
  return typeof value === "string" && SIM_EVENT_CODE_PATTERN.test(value) ? value : undefined;
}

function asNonNegativeInt(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

function asCompletionCode(value: unknown): SessionCompletionCode | undefined {
  if (typeof value === "string") {
    if (value === "completed" || value === "passed" || value === "failed") return value;
    return undefined;
  }
  if (typeof value === "boolean") return value ? "passed" : "failed";
  return undefined;
}

function pulseSessionDetails(payload: unknown): {
  completionCode: SessionCompletionCode;
  totalScore?: number;
} {
  const bag = asRecord(payload);
  const completionCode =
    asCompletionCode(bag?.completion) ??
    asCompletionCode(bag?.status) ??
    asCompletionCode(bag?.result) ??
    asCompletionCode(bag?.passed) ??
    asCompletionCode(bag?.success) ??
    "completed";

  const totalScore =
    asNonNegativeInt(bag?.totalScore) ??
    asNonNegativeInt(bag?.score) ??
    asNonNegativeInt(bag?.attemptScore);

  return totalScore === undefined ? { completionCode } : { completionCode, totalScore };
}

export function mapOpacaEvent(event: OpacaSourceEvent, occurredAt: string): SimEvent | null {
  switch (event.type) {
    case "simulation_started":
      return { event: "sim_started", simId: "opaca", occurredAt };
    case "case_started":
      return { event: "mode_selected", simId: "opaca", occurredAt, modeCode: event.mode };
    case "zone_visited": {
      const targetCode = asCode(event.zoneId);
      return {
        event: "interaction",
        simId: "opaca",
        occurredAt,
        interactionCode: "zone_visited",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "tool_used":
      return {
        event: "interaction",
        simId: "opaca",
        occurredAt,
        interactionCode: "tool_used",
        valueCode: event.tool,
      };
    case "mark_placed": {
      const targetCode = asCode(event.qid);
      return {
        event: "interaction",
        simId: "opaca",
        occurredAt,
        interactionCode: "mark_placed",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "answer_selected": {
      const targetCode = asCode(event.qid);
      return {
        event: "interaction",
        simId: "opaca",
        occurredAt,
        interactionCode: "answer_selected",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "answer_submitted": {
      const questionCode = asCode(event.qid);
      return questionCode === undefined
        ? null
        : {
            event: "answer_submitted",
            simId: "opaca",
            occurredAt,
            questionCode,
            isCorrect: event.correct,
          };
    }
    case "hint_used": {
      const targetCode = asCode(event.caseId);
      return {
        event: "interaction",
        simId: "opaca",
        occurredAt,
        interactionCode: "hint_used",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "case_timeout": {
      const targetCode = asCode(event.caseId);
      return {
        event: "interaction",
        simId: "opaca",
        occurredAt,
        interactionCode: "case_timeout",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "case_completed": {
      const caseCode = asCode(event.caseId);
      return caseCode === undefined
        ? null
        : {
            event: "case_completed",
            simId: "opaca",
            occurredAt,
            caseCode,
            modeCode: event.mode,
          };
    }
    case "assessment_completed": {
      const totalScore = asNonNegativeInt(event.total);
      return totalScore === undefined
        ? {
            event: "session_completed",
            simId: "opaca",
            occurredAt,
            completionCode: "completed",
          }
        : {
            event: "session_completed",
            simId: "opaca",
            occurredAt,
            completionCode: "completed",
            totalScore,
          };
    }
  }
}

export function mapAuscultaEvent(event: AuscultaSourceEvent, occurredAt: string): SimEvent | null {
  switch (event.type) {
    case "simulation_started":
      return { event: "sim_started", simId: "ausculta", occurredAt };
    case "case_started":
      return { event: "mode_selected", simId: "ausculta", occurredAt, modeCode: event.mode };
    case "view_changed":
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "view_changed",
        valueCode: event.view,
      };
    case "point_visited": {
      const targetCode = asCode(event.pointId);
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "point_visited",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "auscultation_started": {
      const targetCode = asCode(event.pointId);
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "auscultation_started",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "auscultation_stopped": {
      const targetCode = asCode(event.pointId);
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "auscultation_stopped",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "filter_changed":
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "filter_changed",
        valueCode: event.head,
      };
    case "sound_replayed": {
      const targetCode = asCode(event.pointId);
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "sound_replayed",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "answer_selected": {
      const targetCode = asCode(event.qid);
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "answer_selected",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "answer_submitted": {
      const questionCode = asCode(event.qid);
      return questionCode === undefined
        ? null
        : {
            event: "answer_submitted",
            simId: "ausculta",
            occurredAt,
            questionCode,
            isCorrect: event.correct,
          };
    }
    case "hint_used": {
      const targetCode = asCode(event.caseId);
      return {
        event: "interaction",
        simId: "ausculta",
        occurredAt,
        interactionCode: "hint_used",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "case_completed": {
      const caseCode = asCode(event.caseId);
      return caseCode === undefined
        ? null
        : {
            event: "case_completed",
            simId: "ausculta",
            occurredAt,
            caseCode,
            modeCode: event.mode,
          };
    }
    case "assessment_completed": {
      const totalScore = asNonNegativeInt(event.total);
      return totalScore === undefined
        ? {
            event: "session_completed",
            simId: "ausculta",
            occurredAt,
            completionCode: "completed",
          }
        : {
            event: "session_completed",
            simId: "ausculta",
            occurredAt,
            completionCode: "completed",
            totalScore,
          };
    }
  }
}

export function mapPulseEvent(event: PulseSourceEvent, occurredAt: string): SimEvent | null {
  switch (event.name) {
    case "cardai:tick":
      return {
        event: "interaction",
        simId: "pulse",
        occurredAt,
        interactionCode: "tick",
      };
    case "cardai:mode": {
      const modeCandidate = asRecord(event.payload)?.mode;
      if (!isPulseModeCode(modeCandidate)) return null;
      return {
        event: "mode_selected",
        simId: "pulse",
        occurredAt,
        modeCode: modeCandidate,
      };
    }
    case "cardai:view": {
      const targetCode = asCode(asRecord(event.payload)?.view);
      return {
        event: "interaction",
        simId: "pulse",
        occurredAt,
        interactionCode: "view_changed",
        ...(targetCode === undefined ? {} : { targetCode }),
      };
    }
    case "cardai:session": {
      const details = pulseSessionDetails(event.payload);
      return {
        event: "session_completed",
        simId: "pulse",
        occurredAt,
        completionCode: details.completionCode,
        ...(details.totalScore === undefined ? {} : { totalScore: details.totalScore }),
      };
    }
    case "cardai:reset":
      return {
        event: "sim_exited",
        simId: "pulse",
        occurredAt,
        reasonCode: "session_reset",
      };
  }
}
