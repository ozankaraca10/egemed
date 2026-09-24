import { describe, expect, it } from "vitest";
import { LOG_LIMIT, LOG_TRIM, createBus, initialState, reducer } from "../../packages/sim-ausculta/src/index";
import type { SimEvent } from "../../packages/sim-ausculta/src/index";

/** Olay veri yolu — mount başına `createBus(now)`; iki örnek birbirine sızmaz. */

describe("olay veri yolu (createBus)", () => {
  it("iki örnek birbirine sızmaz (günlük ve aboneler ayrı)", () => {
    const a = createBus(() => 1);
    const b = createBus(() => 2);
    const seenA: SimEvent[] = [];
    const seenB: SimEvent[] = [];
    a.subscribe((e) => seenA.push(e));
    b.subscribe((e) => seenB.push(e));

    a.emit({ type: "filter_changed", head: "bell" });
    b.emit({ type: "hint_used", caseId: "c1" });
    b.emit({ type: "hint_used", caseId: "c1" });

    expect(a.getLog()).toHaveLength(1);
    expect(a.getLog()[0]?.at).toBe(1);
    expect(b.getLog()).toHaveLength(2);
    expect(b.getLog()[0]?.at).toBe(2);
    expect(seenA.map((e) => e.type)).toEqual(["filter_changed"]);
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
    for (let i = 0; i <= LOG_LIMIT; i++) bus.emit({ type: "point_visited", pointId: `p${i}`, dwellMs: 0 });

    const log = bus.getLog();
    expect(log).toHaveLength(LOG_LIMIT + 1 - LOG_TRIM);
    const first = log[0];
    expect(first?.type === "point_visited" && first.pointId).toBe(`p${LOG_TRIM}`);
  });

  it("reducer olayları seam üzerinden yayar (zaman veri yolunda vurulur)", () => {
    let tick = 0;
    const bus = createBus(() => (tick += 10));
    const seen: SimEvent[] = [];
    bus.subscribe((e) => seen.push(e));
    const seam = { emit: bus.emit };

    let s = reducer(initialState, { type: "setHead", head: "bell" }, seam);
    s = reducer(s, { type: "visit", pointId: "cardiac_aortic" }, seam);
    s = reducer(s, { type: "answer", qid: "q1", values: ["a"] }, seam);
    s = reducer(s, { type: "submitAnswer", qid: "q1", correct: true }, seam);
    reducer(s, { type: "useHint" }, seam);

    expect(seen.map((e) => [e.type, e.at])).toEqual([
      ["filter_changed", 10],
      ["point_visited", 20],
      ["answer_selected", 30],
      ["answer_submitted", 40],
      ["hint_used", 50],
    ]);
  });

  it("seam verilmezse olay yutulur; reducer saf kalır", () => {
    const s = reducer(initialState, { type: "setHead", head: "bell" });
    expect(s.head).toBe("bell");
    expect(s.telemetry.headChanges).toBe(1);
    expect(initialState.head).toBe("diaphragm");
    expect(initialState.telemetry.headChanges).toBe(0);
  });
});
