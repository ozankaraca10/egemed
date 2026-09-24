import { describe, expect, it } from "vitest";
import { LOG_LIMIT, LOG_TRIM, createBus, initialState, reducer } from "../../../packages/sim-opaca/src/index";
import type { SimEvent } from "../../../packages/sim-opaca/src/index";

/** Olay veri yolu grubu — E2 §7.4 port kararının kabulü (S6): modül düzeyi tekil yerine
 *  mount başına örnek (`createBus(now)`), iki örnek birbirine sızmaz, zaman enjekte edilir.
 *  Ayrıca reducer'ın olayları `ReducerSeam` üzerinden yaydığı ve `Date.now()` görmediği doğrulanır. */

describe("olay veri yolu (createBus)", () => {
  it("iki örnek birbirine sızmaz (günlük ve aboneler ayrı)", () => {
    const a = createBus(() => 1);
    const b = createBus(() => 2);
    const seenA: SimEvent[] = [];
    const seenB: SimEvent[] = [];
    a.subscribe((e) => seenA.push(e));
    b.subscribe((e) => seenB.push(e));

    a.emit({ type: "tool_used", tool: "zoom" });
    b.emit({ type: "hint_used", caseId: "c1" });
    b.emit({ type: "hint_used", caseId: "c1" });

    expect(a.getLog()).toHaveLength(1);
    expect(a.getLog()[0]?.at).toBe(1);
    expect(b.getLog()).toHaveLength(2);
    expect(b.getLog()[0]?.at).toBe(2);
    expect(seenA.map((e) => e.type)).toEqual(["tool_used"]);
    expect(seenB.map((e) => e.type)).toEqual(["hint_used", "hint_used"]);
  });

  it("zaman damgası enjekte edilen now() ile vurulur", () => {
    let offset = 0;
    const bus = createBus(() => 1000 + offset);
    const first = bus.emit({ type: "hint_used", caseId: "c1" });
    offset = 58;
    const second = bus.emit({ type: "hint_used", caseId: "c1" });

    expect(first.at).toBe(1000);
    expect(second.at).toBe(1058);
    expect(bus.getLog().map((e) => e.at)).toEqual([1000, 1058]);
  });

  it("abonelik kaldırılınca olay gitmez; günlük abonelikten bağımsız büyür", () => {
    const bus = createBus(() => 5);
    const seen: SimEvent[] = [];
    const off = bus.subscribe((e) => seen.push(e));
    bus.emit({ type: "simulation_started" });
    off();
    bus.emit({ type: "simulation_started" });

    expect(seen).toHaveLength(1);
    expect(bus.getLog()).toHaveLength(2);
  });

  it("günlük 2000 kayıtta kırpılır: en eski 500 düşer", () => {
    const bus = createBus(() => 0);
    for (let i = 0; i <= LOG_LIMIT; i++) bus.emit({ type: "zone_visited", zoneId: `z${i}` });

    const log = bus.getLog();
    expect(log).toHaveLength(LOG_LIMIT + 1 - LOG_TRIM);
    const first = log[0];
    expect(first?.type === "zone_visited" && first.zoneId).toBe(`z${LOG_TRIM}`);
  });

  it("reducer olayları seam üzerinden yayar (zaman veri yolunda vurulur)", () => {
    let tick = 0;
    const bus = createBus(() => (tick += 10));
    const seen: SimEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const seam = { emit: bus.emit };

    let s = reducer(initialState, { type: "toolUsed", tool: "zoom" }, seam);
    s = reducer(s, { type: "answer", qid: "q1", values: ["a"] }, seam);
    s = reducer(s, { type: "submitAnswer", qid: "q1", correct: true }, seam);
    reducer(s, { type: "zoneEnter", zoneIds: ["a_trachea"] }, seam);

    expect(seen.map((e) => [e.type, e.at])).toEqual([
      ["tool_used", 10],
      ["answer_selected", 20],
      ["answer_submitted", 30],
      ["zone_visited", 40],
    ]);
  });

  it("seam verilmezse olay yutulur; reducer saf kalır", () => {
    const s = reducer(initialState, { type: "toolUsed", tool: "zoom" });
    expect(s.telemetry.toolUse.zoom).toBe(1);
    expect(initialState.telemetry.toolUse.zoom).toBe(0);
  });
});
