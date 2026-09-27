import { describe, expect, it } from "vitest";
import { createSimHost, isSimulatorId, SIMULATOR_IDS } from "../../packages/sim-host/src/SimHost";
import type { SimHostEvents, SimModule, SimMountContext, SimMountTarget, SimulatorId } from "../../packages/sim-host/src/SimHost";

const NOW = 1_760_000_000_000;

function deferred() {
  let resolve!: (module: SimModule) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SimModule>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Promise zincirinin oturması için mikro görevleri boşaltır. */
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function fake(id: SimulatorId, onDispose?: () => void) {
  const contexts: SimMountContext[] = [];
  let disposals = 0;
  const module: SimModule = {
    id,
    mount(_target, context) {
      contexts.push(context);
      return () => {
        disposals += 1;
        onDispose?.();
      };
    },
  };
  return { module, contexts, disposeCount: () => disposals };
}

function harness(load: (simId: SimulatorId) => Promise<SimModule>, withEvents = true) {
  const log = {
    loading: [] as SimulatorId[],
    ready: [] as SimulatorId[],
    errors: [] as { simId: SimulatorId; error: unknown }[],
  };
  const events: SimHostEvents = withEvents
    ? { onLoading: (id) => log.loading.push(id), onReady: (id) => log.ready.push(id), onError: (id, error) => log.errors.push({ simId: id, error }) }
    : {};
  const host = createSimHost({ load, now: () => NOW, events });
  return { host, log, target: { appendChild: (node) => node } as SimMountTarget };
}

describe("sim kimliği", () => {
  it("kapalı birlik tipini çalışma zamanında doğrular", () => {
    expect(SIMULATOR_IDS).toEqual(["pulse", "ausculta", "opaca"]);
    for (const id of SIMULATOR_IDS) expect(isSimulatorId(id)).toBe(true);
    for (const value of ["kalp", "", null, 42, { id: "pulse" }]) expect(isSimulatorId(value)).toBe(false);
  });

  it("bilinmeyen kimlik reddedilir, etkin oturum korunur", async () => {
    const pulse = fake("pulse");
    const { host, log, target } = harness(() => Promise.resolve(pulse.module));
    host.mount(target, "pulse");
    await flush();
    expect(() => host.mount(target, "kalp" as unknown as SimulatorId)).toThrow(/Bilinmeyen/);
    expect([host.active, log.errors]).toEqual(["pulse", []]);
  });
});

describe("SimHost yaşam döngüsü", () => {
  it("istenen bağlamla mount eder; loading/active/ready sırası doğrudur", async () => {
    const pending = deferred();
    const pulse = fake("pulse");
    const { host, log, target } = harness(() => pending.promise);
    host.mount(target, "pulse");
    expect([host.loading, host.active, log.loading]).toEqual(["pulse", null, ["pulse"]]);
    pending.resolve(pulse.module);
    await flush();
    expect([host.loading, host.active, log.ready, log.errors]).toEqual([null, "pulse", ["pulse"], []]);
    const [context] = pulse.contexts;
    expect([context?.simId, context?.now()]).toEqual(["pulse", NOW]);
  });

  it("yeni mount önceki oturumu kapatır", async () => {
    const pulse = fake("pulse");
    const opaca = fake("opaca");
    const { host, log, target } = harness((simId) =>
      Promise.resolve(simId === "pulse" ? pulse.module : opaca.module),
    );
    host.mount(target, "pulse");
    await flush();
    host.mount(target, "opaca");
    await flush();
    expect([pulse.disposeCount(), opaca.disposeCount()]).toEqual([1, 0]);
    expect([host.active, log.ready, log.errors]).toEqual(["opaca", ["pulse", "opaca"], []]);
  });

  it("dispose oturumu kapatır ve idempotenttir", async () => {
    const pulse = fake("pulse");
    const { host, log, target } = harness(() => Promise.resolve(pulse.module));
    host.mount(target, "pulse");
    await flush();
    host.dispose();
    host.dispose();
    expect([host.active, pulse.disposeCount(), log.errors]).toEqual([null, 1, []]);
  });

  it.each(["dispose", "yeni mount"] as const)(
    "geç çözülen yükleme mount edilmez (%s sonrası)",
    async (mode) => {
      const slow = deferred();
      const pulse = fake("pulse");
      const next = fake("ausculta");
      const { host, log, target } = harness((simId) =>
        simId === "pulse" ? slow.promise : Promise.resolve(next.module),
      );
      host.mount(target, "pulse");
      if (mode === "dispose") host.dispose();
      else host.mount(target, "ausculta");
      await flush();
      slow.resolve(pulse.module);
      await flush();
      expect([host.active, pulse.contexts.length, log.errors]).toEqual([mode === "dispose" ? null : "ausculta", 0, []]);
      expect(log.ready).toEqual(mode === "dispose" ? [] : ["ausculta"]);
    },
  );

  it("mount sırasında host dispose edilirse geç gelen oturum hemen temizlenir", async () => {
    let disposals = 0;
    const { host, log, target } = harness(() =>
      Promise.resolve({
        id: "pulse",
        mount() {
          host.dispose();
          return () => {
            disposals += 1;
          };
        },
      }),
    );
    host.mount(target, "pulse");
    await flush();
    expect([host.active, host.loading, disposals, log.ready, log.errors]).toEqual([null, null, 1, [], []]);
  });

  it.each(["mount", "dispose"] as const)(
    "temizlik sırasında başlayan yeni mount ezilmez (%s yolu)",
    async (entry) => {
      const ausculta = fake("ausculta");
      const h = harness((simId) =>
        Promise.resolve(simId === "pulse" ? pulse.module : ausculta.module),
      );
      const pulse = fake("pulse", () => h.host.mount(h.target, "ausculta"));
      h.host.mount(h.target, "pulse");
      await flush();
      if (entry === "mount") h.host.mount(h.target, "ausculta");
      else h.host.dispose();
      await flush();
      expect([pulse.disposeCount(), ausculta.contexts.length]).toEqual([1, 1]);
      expect([h.host.active, h.host.loading]).toEqual(["ausculta", null]);
      expect([h.log.loading, h.log.ready, h.log.errors]).toEqual([["pulse", "ausculta"], ["pulse", "ausculta"], []]);
    },
  );
});

const failures: readonly { ad: string; load: () => Promise<SimModule>; beklenen: string }[] = [
  { ad: "senkron yükleme hatası", load: () => { throw new Error("yükleme hatası"); }, beklenen: "yükleme hatası" },
  { ad: "asenkron reddetme", load: () => Promise.reject(new Error("ağ hatası")), beklenen: "ağ hatası" },
  { ad: "yanlış modül kimliği", load: () => Promise.resolve(fake("opaca").module), beklenen: "Yükleyici pulse istendiğinde opaca modülü döndürdü" },
  { ad: "mount hatası", load: () => Promise.resolve({ id: "pulse", mount() { throw new Error("mount hatası"); } }), beklenen: "mount hatası" },
  { ad: "cleanup yerine undefined", load: () => Promise.resolve({ id: "pulse", mount: () => undefined } as unknown as SimModule), beklenen: "Sim modülü pulse geçerli bir cleanup fonksiyonu döndürmedi" },
];

describe("SimHost hata yolları", () => {
  it.each(failures)(
    "$ad: oturum kurulmaz, onError bildirilir, host toparlanır",
    async ({ load, beklenen }) => {
      const pulse = fake("pulse");
      let calls = 0;
      const { host, log, target } = harness(() => {
        calls += 1;
        return calls === 1 ? load() : Promise.resolve(pulse.module);
      });
      host.mount(target, "pulse");
      await flush();
      expect([host.active, host.loading, log.ready]).toEqual([null, null, []]);
      expect([log.errors[0]?.simId, messageOf(log.errors[0]?.error)]).toEqual(["pulse", beklenen]);
      host.mount(target, "pulse");
      await flush();
      expect([host.active, log.errors.length]).toEqual(["pulse", 1]);
    },
  );

  it("temizlik fırlatırsa onError bildirilir, oturum kapanır", async () => {
    const pulse = fake("pulse", () => {
      throw new Error("temizlik hatası");
    });
    const { host, log, target } = harness(() => Promise.resolve(pulse.module));
    host.mount(target, "pulse");
    await flush();
    host.dispose();
    host.dispose();
    expect([host.active, pulse.disposeCount()]).toEqual([null, 1]);
    expect(log.errors.map((entry) => messageOf(entry.error))).toEqual(["temizlik hatası"]);
  });

  it("olay geri çağrıları isteğe bağlıdır", async () => {
    const pending = deferred();
    const { host, target } = harness(() => pending.promise, false);
    host.mount(target, "opaca");
    pending.reject(new Error("yok"));
    await flush();
    host.dispose();
    expect([host.active, host.loading]).toEqual([null, null]);
  });
});

describe("SimHost release ve aktör bağlamı", () => {
  it("eski mount'un ertelenmiş release'i yeni yüklemeyi iptal etmez (PLATFORM-01)", async () => {
    const pulse = fake("pulse");
    const opaca = fake("opaca");
    const pending = deferred();
    const { host, log, target } = harness((id) => (id === "pulse" ? Promise.resolve(pulse.module) : pending.promise));
    const first = host.mount(target, "pulse");
    await flush();
    const second = host.mount(target, "opaca");
    expect(pulse.disposeCount()).toBe(1);
    host.release(first);
    pending.resolve(opaca.module);
    await flush();
    expect(host.active).toBe("opaca");
    expect(log.ready).toEqual(["pulse", "opaca"]);
    host.release(second);
    expect(host.active).toBeNull();
    expect(opaca.disposeCount()).toBe(1);
  });

  it("actorId bağlama taşınır; verilmezse alan hiç yoktur", async () => {
    const pulse = fake("pulse");
    const { host, target } = harness(() => Promise.resolve(pulse.module));
    host.mount(target, "pulse", { actorId: "dev-student-0001" });
    await flush();
    host.mount(target, "pulse");
    await flush();
    expect(pulse.contexts[0]?.actorId).toBe("dev-student-0001");
    expect(pulse.contexts[1] !== undefined && "actorId" in pulse.contexts[1]).toBe(false);
  });

  it("kitle ve requestSignIn bağlama taşınır; verilmezse alanlar yoktur (T180)", async () => {
    const pulse = fake("pulse");
    let signIns = 0;
    const { host, target } = harness(() => Promise.resolve(pulse.module));
    host.mount(target, "pulse", { audience: "visitor", requestSignIn: () => (signIns += 1) });
    await flush();
    host.mount(target, "pulse");
    await flush();
    expect(pulse.contexts[0]?.audience).toBe("visitor");
    pulse.contexts[0]?.requestSignIn?.();
    expect(signIns).toBe(1);
    expect(pulse.contexts[1] !== undefined && "audience" in pulse.contexts[1]).toBe(false);
    expect(pulse.contexts[1] !== undefined && "requestSignIn" in pulse.contexts[1]).toBe(false);
  });

  it("sessions (A1 sunucu oturumu) kanalı bağlama taşınır; verilmezse alan yoktur", async () => {
    const pulse = fake("pulse");
    const { host, target } = harness(() => Promise.resolve(pulse.module));
    const sessions = {
      start: () => Promise.reject(new Error("x")),
      getCase: () => Promise.reject(new Error("x")),
      hint: () => Promise.reject(new Error("x")),
      check: () => Promise.reject(new Error("x")),
      startChallenge: () => Promise.reject(new Error("x")),
      answer: () => Promise.reject(new Error("x")),
      finish: () => Promise.reject(new Error("x")),
      audioUrl: (id: string, token: string) => `/api/${id}/${token}`,
    };
    host.mount(target, "pulse", { sessions });
    await flush();
    host.mount(target, "pulse");
    await flush();
    expect(pulse.contexts[0]?.sessions?.audioUrl("s", "t")).toBe("/api/s/t");
    expect(pulse.contexts[1] !== undefined && "sessions" in pulse.contexts[1]).toBe(false);
  });

  it("reportAttempt bağlama taşınır; verilmezse alan hiç yoktur", async () => {
    const pulse = fake("pulse");
    const seen: string[] = [];
    const { host, target } = harness(() => Promise.resolve(pulse.module));
    host.mount(target, "pulse", {
      reportAttempt: (attempt) => {
        seen.push(attempt.id);
      },
    });
    await flush();
    host.mount(target, "pulse", { actorId: "dev-student-0001" });
    await flush();
    pulse.contexts[0]?.reportAttempt?.({
      id: "yerel-1",
      mode: "assessment",
      finishedAt: "2026-09-24T12:00:00.000Z",
      score: 100,
      mastery: true,
      caseCount: 10,
      hintsUsed: 0,
      durationMs: 1_000,
      domains: {},
      extra: {},
    });
    expect(seen).toEqual(["yerel-1"]);
    expect(pulse.contexts[1] !== undefined && "reportAttempt" in pulse.contexts[1]).toBe(false);
  });

  it("gamification bağlama taşınır; verilmezse alan hiç yoktur", async () => {
    const pulse = fake("pulse");
    const source = {
      async summary() {
        return { xp: 1, level: 1, streak: { current: 0, best: 0 }, badges: [] };
      },
      async leaderboard() {
        return { rows: [] };
      },
    };
    const { host, target } = harness(() => Promise.resolve(pulse.module));
    host.mount(target, "pulse", { gamification: source });
    await flush();
    host.mount(target, "pulse");
    await flush();
    expect(pulse.contexts[0]?.gamification).toBe(source);
    expect(pulse.contexts[1] !== undefined && "gamification" in pulse.contexts[1]).toBe(false);
  });
});

describe("kitle sözleşmesi (26 Eyl 2026)", () => {
  it("varsayılan öğrencidir; oyunlaştırma yalnız öğrenciye, ziyaretçi yalnız öğrenme modunu açar", async () => {
    const host = await import("../../packages/sim-host/src/index");
    expect(host.audienceOf({})).toBe("student");
    expect(host.audienceOf({ audience: "faculty" })).toBe("faculty");
    expect(host.SIM_AUDIENCES.map((a) => host.audienceShowsGamification(a))).toEqual([true, false, false]);
    expect(host.audienceCanUseMode("visitor", "learn")).toBe(true);
    expect(host.audienceCanUseMode("visitor", "practice")).toBe(false);
    expect(host.audienceCanUseMode("visitor", "assessment")).toBe(false);
    expect(host.audienceCanUseMode("faculty", "assessment")).toBe(true);
    expect(host.VISITOR_LOCK_TEXT.locked).toContain("Ege Üniversitesi Tıp Fakültesi");
  });
});
