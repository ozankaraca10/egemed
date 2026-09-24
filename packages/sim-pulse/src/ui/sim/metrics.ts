import type { CardiacModel, CardiacMetrics } from "../../engine/model";

export type PulsePhase = "atrial" | "chaotic" | "eject" | "fill" | "qrs" | "t";
export type PulseMetricId = "pr" | "qrs" | "qt" | "rr" | "st";

export interface PulseMetricReadout {
  readonly id: PulseMetricId;
  readonly labelKey: `sim.pulse.metric.${PulseMetricId}`;
  readonly value: string | null;
  readonly unit: "ms" | "mV";
}

const PHASE_KEYS: Readonly<Record<PulsePhase, `sim.pulse.phase.${PulsePhase}`>> = {
  atrial: "sim.pulse.phase.atrial",
  chaotic: "sim.pulse.phase.chaotic",
  eject: "sim.pulse.phase.eject",
  fill: "sim.pulse.phase.fill",
  qrs: "sim.pulse.phase.qrs",
  t: "sim.pulse.phase.t",
};

export function pulsePhaseLabelKey(phase: string): `sim.pulse.phase.${PulsePhase}` {
  return PHASE_KEYS[phase as PulsePhase] ?? PHASE_KEYS.fill;
}

export function pulseMetricReadouts(metrics: CardiacMetrics): readonly PulseMetricReadout[] {
  const ms = (value: number | null): string | null => value === null ? null : String(value);
  return [
    { id: "rr", value: ms(metrics.rr), unit: "ms" },
    { id: "pr", value: ms(metrics.pr), unit: "ms" },
    { id: "qrs", value: ms(metrics.qrs), unit: "ms" },
    { id: "qt", value: ms(metrics.qt), unit: "ms" },
    { id: "st", value: metrics.st === null ? null : Number(metrics.st.toFixed(2)).toString().replace(".", ","), unit: "mV" },
  ].map((metric) => ({ ...metric, labelKey: `sim.pulse.metric.${metric.id}` as const }));
}

export function pulseMetricSnapshot(model: CardiacModel, time: number, lead = "II") {
  const snapshot = model.snapshot(time);
  return {
    phaseKey: pulsePhaseLabelKey(snapshot.phase),
    metrics: pulseMetricReadouts(model.metrics(time, lead)),
  } as const;
}
