import { describe, expect, it, vi } from "vitest";
import { createBrowserStageEnv } from "../../packages/sim-ausculta/src/ui/PatientStage";

describe("createBrowserStageEnv", () => {
  it("gerçek zamanlayıcıları çalıştırır — dinleme gecikmesi tetiklenir", () => {
    vi.useFakeTimers();
    try {
      const env = createBrowserStageEnv();
      const timeout = vi.fn();
      const interval = vi.fn();
      env.setTimeout(timeout, 300);
      const handle = env.setInterval(interval, 100);
      vi.advanceTimersByTime(350);
      env.clearInterval(handle);
      vi.advanceTimersByTime(500);
      expect(timeout).toHaveBeenCalledTimes(1);
      expect(interval).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
