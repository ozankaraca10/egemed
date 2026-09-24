import type { PulseController } from "./controller";
import { ACTIVE_VIEWS } from "./state";
import type { ActiveView, PulseState } from "./state";
import { LEADS, MODES } from "./shapes";
import type { Lead, Mode } from "./shapes";
import type { PulseEventEmitter } from "../host/events";

const MODE_LEADS: Record<Mode, [Lead, Lead, Lead]> = {
  normal: ["II", "aVF", "V3"], af: ["II", "aVF", "V1"],
  stemi: ["II", "aVL", "V3"], pvc: ["II", "aVR", "V1"],
  svt: ["II", "aVF", "V1"], inferior: ["II", "aVF", "V1"],
  vt: ["II", "aVR", "V1"], vf: ["II", "aVF", "V1"],
  pat: ["II", "aVF", "V1"], flutter: ["II", "aVF", "V1"],
  sintach: ["II", "aVF", "V3"], lbbb: ["I", "aVL", "V6"],
  rbbb: ["I", "aVR", "V1"],
};

export interface PulseActionContext {
  events: PulseEventEmitter;
  controller?: PulseController;
}

const isMode = (value: unknown): value is Mode =>
  typeof value === "string" && (MODES as readonly string[]).includes(value);

function emitMode(state: PulseState, context: PulseActionContext): void {
  context.controller?.observeMode(state.activeView === "sim" || state.activeView === "tutorial" ? state.mode : null);
  context.events.emit("cardai:mode", { mode: state.mode });
}

/** Rhythm mode transition, independent of any DOM or renderer. */
export function applyMode(
  state: PulseState,
  mode: Mode,
  context: PulseActionContext,
  resetTime = true,
): boolean {
  if (!isMode(mode)) return false;
  state.mode = mode;
  if (resetTime) {
    state.time = 2;
    state.leads = [...MODE_LEADS[mode]];
    state.activeLead = 0;
    state.lead = state.leads[0];
  }
  emitMode(state, context);
  return true;
}

const LEAD_GROUPS: readonly (readonly Lead[])[] = [
  ["I", "II", "III"], ["aVR", "aVL", "aVF"],
  ["V1", "V2", "V3", "V4", "V5", "V6"],
];

export function selectLead(state: PulseState, lead: Lead, context: PulseActionContext): boolean;
export function selectLead(state: PulseState, column: number, lead: Lead, context: PulseActionContext): boolean;
export function selectLead(
  state: PulseState,
  columnOrLead: number | Lead,
  leadOrContext: Lead | PulseActionContext,
  maybeContext?: PulseActionContext,
): boolean {
  const column = typeof columnOrLead === "number"
    ? columnOrLead
    : LEAD_GROUPS.findIndex((group) => group.includes(columnOrLead));
  const lead = typeof columnOrLead === "number" ? leadOrContext as Lead : columnOrLead;
  const context = typeof columnOrLead === "number" ? maybeContext : leadOrContext as PulseActionContext;
  if (!context || !LEAD_GROUPS[column]?.includes(lead) || !(LEADS as readonly string[]).includes(lead)) return false;
  state.leads[column] = lead;
  state.activeLead = column;
  state.lead = lead;
  emitMode(state, context);
  return true;
}

/** Change the active screen and keep controller observation in sync with visibility. */
export function showView(
  state: PulseState,
  context: PulseActionContext,
  requested: ActiveView | string = "sim",
): ActiveView {
  const view = (ACTIVE_VIEWS as readonly string[]).includes(requested) ? requested as ActiveView : "sim";
  context.controller?.pause();
  state.activeView = view;
  context.controller?.observeMode(view === "sim" || view === "tutorial" ? state.mode : null);
  context.events.emit("cardai:view", { view });
  return view;
}
