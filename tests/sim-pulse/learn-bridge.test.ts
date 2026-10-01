import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PULSE_LEARN_COMPLETE_EVENT,
  PULSE_LEARN_VERSION_PATTERN,
  createPulseLearnBridge,
  pulseContentVersion,
  pulseLearnPort,
  type PulseLearnPort,
} from "../../packages/sim-pulse/src/index";

/**
 * T213 — Pulse öğrenme tamamlamayı platforma bağlar (Z2). Köprü saf TS
 * modülüdür; kilit kararı çalışan runtime kaynaklarından (ADR-011:
 * vendor/model.js, curriculum.js, state.js) doğrulanır.
 */
const VENDOR = "packages/sim-pulse/src/runtime/vendor";

function runVendor(path: string, win: Record<string, unknown>): void {
  const source = readFileSync(path, "utf8").replace("export default function run", "return function run");
  (new Function("module", source)(undefined) as (env: { window: Record<string, unknown> }) => void)({ window: win });
}

function loadRuntime(): Record<string, unknown> {
  const win: Record<string, unknown> = {};
  runVendor(`${VENDOR}/model.js`, win);
  win["CardAIScorm"] = { previousStatus: "" };
  runVendor(`${VENDOR}/curriculum.js`, win);
  runVendor(`${VENDOR}/state.js`, win);
  return win;
}

interface Gates {
  readonly simComplete: boolean;
  readonly viewedComplete: boolean;
  readonly hostLearnComplete: boolean;
  readonly casesComplete: boolean;
  readonly casesUnlocked: boolean;
  readonly quizUnlocked: boolean;
}
interface StateShape {
  readonly viewed: Readonly<Record<string, number>>;
  readonly caseSession: {
    readonly ids: readonly string[];
    readonly answers: readonly (number | null)[];
    readonly submitted: readonly boolean[];
    readonly leadSelections: readonly (readonly string[])[];
    readonly interactionIndices: readonly (number | null)[];
  };
}
interface StateApi {
  blank(): StateShape;
  decode(raw: unknown): StateShape;
  derive(state: StateShape): Gates;
}
interface CurriculumShape {
  readonly version: number;
}

const runtimeWindow = loadRuntime();
const stateApi = runtimeWindow["PulseState"] as StateApi;
const curriculum = runtimeWindow["PulseCurriculum"] as CurriculumShape;
const readGlobal = (name: string): unknown => runtimeWindow[name];

/** v6 kaydı: 23 patern izlenmiş ve 10 vaka gönderilmiş. */
function v6Record(): Record<string, unknown> {
  return {
    version: 6,
    cv: curriculum.version,
    m: 0,
    t: 2,
    p: 1,
    f: 0,
    v: Array.from({ length: 23 }, () => 60_000),
    u: 4,
    c: {
      i: "egemed-test-session-001",
      n: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      a: Array.from({ length: 10 }, () => 0),
      s: 1023,
      l: Array.from({ length: 10 }, () => [0, 0, 0]),
      x: Array.from({ length: 10 }, () => -1),
    },
  };
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
};

describe("T213 öğrenme kanalı — mount bağlamı ve sürüm", () => {
  it("kanal bağlamdan yapısal okunur; ziyaretçide/eksik nesnede yok sayılır", () => {
    const markComplete = (): Promise<void> => Promise.resolve();
    const port: PulseLearnPort = { complete: false, markComplete };
    expect(pulseLearnPort({ simId: "pulse", learn: port })).toBe(port);
    expect(pulseLearnPort({ simId: "pulse" })).toBeUndefined();
    expect(pulseLearnPort({ learn: null })).toBeUndefined();
    expect(pulseLearnPort({ learn: { complete: true } })).toBeUndefined();
    expect(pulseLearnPort(undefined)).toBeUndefined();
  });

  it("içerik sürümü runtime küresellerinden pulse-23-8 olarak üretilir ve desene uyar", () => {
    const version = pulseContentVersion(runtimeWindow["CardAIModel"], runtimeWindow["PulseCurriculum"]);
    expect(version).toBe("pulse-23-8");
    expect(PULSE_LEARN_VERSION_PATTERN.test(version ?? "")).toBe(true);
    expect(pulseContentVersion(undefined, undefined)).toBeNull();
    expect(pulseContentVersion({ ALL_MODES: [] }, { version: 8 })).toBeNull();
    expect(pulseContentVersion({ ALL_MODES: ["a"] }, { version: "8" })).toBeNull();
  });
});

describe("T213 öğrenme köprüsü — markComplete", () => {
  it("olay gelince bir kez ve doğru sürümle çağırır", () => {
    const calls: string[] = [];
    const learn: PulseLearnPort = {
      complete: false,
      markComplete: (contentVersion) => {
        calls.push(contentVersion);
        return Promise.resolve();
      },
    };
    const bridge = createPulseLearnBridge(learn);
    bridge.bind(readGlobal);
    bridge.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined);
    bridge.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined);
    expect(calls).toEqual(["pulse-23-8"]);
  });

  it("açılışta yerel durum tamamsa (olay mount içinde gelirse) kayıt bind ile tazelenir", () => {
    const calls: string[] = [];
    const learn: PulseLearnPort = {
      complete: false,
      markComplete: (contentVersion) => {
        calls.push(contentVersion);
        return Promise.resolve();
      },
    };
    const bridge = createPulseLearnBridge(learn);
    bridge.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined);
    expect(calls).toEqual([]);
    bridge.bind(readGlobal);
    expect(calls).toEqual(["pulse-23-8"]);
    bridge.bind(readGlobal);
    expect(calls).toEqual(["pulse-23-8"]);
  });

  it("kanalsız (ziyaretçi) kurulumda çağrı yok; olay alt köprüye iletilir", () => {
    const forwarded: string[] = [];
    const bridge = createPulseLearnBridge(undefined, {
      onEvent: (type) => {
        forwarded.push(type);
      },
    });
    bridge.bind(readGlobal);
    expect(() => bridge.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined)).not.toThrow();
    expect(forwarded).toEqual([PULSE_LEARN_COMPLETE_EVENT]);
  });

  it("markComplete hatası yutulur, aynı oturumda yeniden denenmez; sonraki açılışta denenir", async () => {
    let attempts = 0;
    const failing: PulseLearnPort = {
      complete: false,
      markComplete: (): Promise<void> => {
        attempts += 1;
        return Promise.reject(new Error("ağ hatası"));
      },
    };
    const bridge = createPulseLearnBridge(failing);
    bridge.bind(readGlobal);
    bridge.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined);
    bridge.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined);
    await flush();
    expect(attempts).toBe(1);

    const throwing: PulseLearnPort = {
      complete: false,
      markComplete: (): Promise<void> => {
        attempts += 1;
        throw new Error("eşzamanlı hata");
      },
    };
    const syncBridge = createPulseLearnBridge(throwing);
    syncBridge.bind(readGlobal);
    expect(() => syncBridge.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined)).not.toThrow();
    expect(attempts).toBe(2);

    const nextSession = createPulseLearnBridge(failing);
    nextSession.bind(readGlobal);
    nextSession.bridge.onEvent?.(PULSE_LEARN_COMPLETE_EVENT, undefined);
    await flush();
    expect(attempts).toBe(3);
  });
});

describe("T213 host tamamlaması — kilit kararı", () => {
  it("host complete ise yerel 0/23 iken vaka kilidi açılır; yerel izlenme kaydı değişmez", () => {
    const state = stateApi.blank();
    runtimeWindow["__pulseLearnComplete"] = false;
    const locked = stateApi.derive(state);
    expect([locked.simComplete, locked.casesUnlocked, locked.quizUnlocked]).toEqual([false, false, false]);

    runtimeWindow["__pulseLearnComplete"] = true;
    const gates = stateApi.derive(state);
    expect([gates.simComplete, gates.casesUnlocked, gates.hostLearnComplete]).toEqual([true, true, true]);
    expect(gates.viewedComplete).toBe(false);
    expect(Object.values(state.viewed).every((seconds) => seconds === 0)).toBe(true);
  });

  it("host tamamlaması vakalar gönderilmemişken değerlendirmeyi açmaz; vakalarla açılır", () => {
    runtimeWindow["__pulseLearnComplete"] = true;
    const withoutCases = stateApi.derive(stateApi.blank());
    expect(withoutCases.quizUnlocked).toBe(false);
    const withCases = stateApi.derive(stateApi.decode(v6Record()));
    expect([withCases.hostLearnComplete, withCases.casesUnlocked, withCases.quizUnlocked]).toEqual([true, true, true]);
    runtimeWindow["__pulseLearnComplete"] = false;
    const localOnly = stateApi.derive(stateApi.decode(v6Record()));
    expect([localOnly.viewedComplete, localOnly.quizUnlocked]).toEqual([true, true]);
  });
});
