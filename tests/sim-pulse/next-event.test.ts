import { describe, expect, it } from "vitest";
import { CardiacModel, MODES } from "../../packages/sim-pulse/src/index";

describe("CardiacModel nextEvent regresyonu", () => {
  it("13 modda 500 olay boyunca monoton ilerler ve yığın taşırmaz", () => {
    for (const mode of MODES) {
      const model = new CardiacModel(mode);
      let time = 0;

      // Kaynak model.js bu döngüde düzeltme öncesi VF dışındaki modlarda
      // yaklaşık 5,4 saniyede aynı between aralığını yineleyerek yığın taşırıyordu.
      for (let step = 0; step < 500; step += 1) {
        const events = model.eventTimes(time, time + 2);
        for (const [index, event] of events.entries()) {
          expect(event, `${mode} olay ${step}.${index}`).toBeGreaterThan(time);
          if (index > 0) {
            expect(event, `${mode} olay sırası ${step}.${index}`).toBeGreaterThanOrEqual(events[index - 1] ?? time);
          }
        }
        const next = model.nextEvent(time);
        expect(Number.isFinite(next), `${mode} adım ${step}`).toBe(true);
        expect(next, `${mode} adım ${step}`).toBeGreaterThan(time);
        expect(next, `${mode} ilk olay ${step}`).toBe(events[0] ?? time + 0.1);
        time = next;
      }
    }
  });

  it("ileri kullanımdan sonra geri atlayan t değerini güvenle işler", () => {
    for (const mode of MODES) {
      const model = new CardiacModel(mode);
      let time = 0;
      for (let step = 0; step < 100; step += 1) {
        time = model.nextEvent(time);
      }

      const backwardsTime = 0.5;
      const next = model.nextEvent(backwardsTime);
      expect(Number.isFinite(next), mode).toBe(true);
      expect(next, mode).toBeGreaterThan(backwardsTime);
    }
  });
});
