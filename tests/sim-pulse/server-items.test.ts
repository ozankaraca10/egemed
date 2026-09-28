import { describe, expect, it } from "vitest";
import type { SimCaseResult, SimSession } from "../../packages/contracts/src/index";
import type { SimSessionSource } from "../../packages/sim-host/src/index";
import {
  PULSE_SERVER_ITEMS_GLOBAL,
  PULSE_SERVER_REQUIRED_TEXT,
  PULSE_SERVER_RESULTS_GLOBAL,
  PULSE_SERVER_RESULT_EVENT,
  adaptServerItem,
  asPulsePublicCase,
  attachPulseServerRequired,
  createPulseServerItemsBridge,
  pulseServerErrorMessage,
  type PulseServerPublicCase,
} from "../../packages/sim-pulse/src/index";

/**
 * A3.3 (ADR-009): Pulse vaka/sınav maddeleri sunucu oturumundan gelir; köprü
 * seçim indeksini opak jetona çevirir, madde biçimini runtime'a uyarlar ve
 * cevap anahtarını taşımaz. Sunucu sıralı açılış ister (A1 §3): sonraki madde
 * bir önceki yanıtlanır yanıtlanmaz önceden yüklenir.
 */

const SESSION: SimSession = {
  sessionId: "00000000-0000-4000-8000-00000000abcd",
  mode: "practice",
  caseCount: 10,
  perCaseLimitMs: null,
  totalLimitMs: null,
  startedAt: "2026-09-28T10:00:00.000+03:00",
};

const RESULT: SimCaseResult = {
  index: 1,
  title: "Sentetik vaka C001",
  diagnosis: null,
  summary: "Özet",
  total: 100,
  max: 100,
  mastery: true,
  domains: { recognition: { earned: 100, max: 100 } },
  hintsUsed: 0,
  questions: [{ questionId: "q", correct: true, correctOptionIds: ["tok_ccccc000"], feedback: "Doğru." }],
};

/** Sunucu maddesi: doğru cevap istemciye GİTMEZ; seçenekler opak jetonludur. */
function publicCase(index: number, section: "case" | "quiz" = "case"): PulseServerPublicCase {
  return {
    simId: "pulse",
    index,
    label: `Vaka ${index}`,
    section,
    stem: `${index}. sentetik olgu`,
    question: `${index}. soru?`,
    vitals: [{ label: "Nabız", value: "72/dk" }],
    options: [
      { id: `tok_aaaaa00${index}`, label: "Seçenek A" },
      { id: `tok_bbbbb00${index}`, label: "Seçenek B" },
      { id: `tok_ccccc00${index}`, label: "Seçenek C" },
      { id: `tok_ddddd00${index}`, label: "Seçenek D" },
      { id: "tok_eeeee000", label: "Seçenek E" },
    ],
    ecg: { mode: "normal", options: {}, leads: ["II", "aVF", "V1"], start: 2, seconds: 4 },
  };
}

function fakeSessions(overrides: Partial<SimSessionSource> = {}) {
  const calls: string[] = [];
  let started: "practice" | "assessment" = "practice";
  const source: SimSessionSource = {
    start: async (mode) => {
      calls.push(`start:${mode}`);
      started = mode;
      return { ...SESSION, mode };
    },
    getCase: async (_id, index) => {
      calls.push(`case:${index}`);
      return publicCase(index) as never;
    },
    hint: async () => Promise.reject(new Error("not_found")),
    check: async (_id, index, questionId, answer) => {
      calls.push(`check:${index}:${questionId}:${answer.join(",")}`);
      const correctToken = `tok_ccccc00${index}`;
      return { questionId, correct: answer[0] === correctToken, correctOptionIds: [correctToken], feedback: "Gerekçe" };
    },
    answer: async (_id, index) => {
      calls.push(`answer:${index}`);
      return started === "practice" ? { mode: "practice", result: { ...RESULT, index } } : { mode: "assessment", accepted: true };
    },
    finish: async () => {
      calls.push("finish");
      return { mode: "practice", total: 100, max: 100, passed: true, cases: [RESULT], xpGained: 40 };
    },
    audioUrl: () => "",
    imageUrl: () => "",
    startChallenge: async () => Promise.reject(new Error("not_found")),
    ...overrides,
  };
  return { source, calls };
}

describe("Pulse sunucu maddeleri — uyarlama", () => {
  it("runtime maddesi yalnız genel seçenek etiketlerini taşır; doğru/gerekçe yoktur", () => {
    const item = adaptServerItem(publicCase(1));
    expect(item.options).toEqual(["Seçenek A", "Seçenek B", "Seçenek C", "Seçenek D", "Seçenek E"]);
    expect(item.vitals).toEqual([{ k: "Nabız", v: "72/dk" }]);
    expect(item.text).toBe("1. soru?");
    expect(item.ariaLabel).toContain("Vaka 1");
    expect(Object.keys(item)).not.toContain("correct");
    expect(Object.keys(item)).not.toContain("explanations");
    expect(JSON.stringify(item)).not.toMatch(/"correct"|"explanations"|"feedback"/);
  });

  it("Pulse gövdesi olmayan/bozuk yanıt köprüye alınmaz", () => {
    expect(asPulsePublicCase(undefined)).toBeNull();
    expect(asPulsePublicCase({ simId: "ausculta" })).toBeNull();
    expect(asPulsePublicCase({ simId: "pulse", section: "case", stem: "a", question: "b", options: [] })).toBeNull();
    expect(asPulsePublicCase(publicCase(1))).not.toBeNull();
  });

  it("sunucu hata kodları Türkçe iletiye çevrilir", () => {
    expect(pulseServerErrorMessage(new Error("validation_failed case_time_exceeded"))).toContain("süresi doldu");
    expect(pulseServerErrorMessage(new Error("conflict session_finished"))).toContain("sona erdi");
    expect(pulseServerErrorMessage(new Error("rate_limited"))).toContain("Çok sık");
    expect(pulseServerErrorMessage(new Error("boom"))).toContain("Sunucuya ulaşılamadı");
  });
});

describe("Pulse sunucu köprüsü — oturum akışı", () => {
  it("uygulama: start → madde; check/answer sırasıyla jeton gönderir; 10. maddeden sonra finish", async () => {
    const { source, calls } = fakeSessions();
    const bridge = createPulseServerItemsBridge(source);
    await bridge.start("case");
    expect(bridge.port.section).toBe("case");
    expect(bridge.port.status).toBe("ready");
    expect(bridge.port.caseCount).toBe(10);
    expect(bridge.port.items[0]?.id).toBe("Vaka 1");
    // Sıralı açılış: yalnız ilk madde açılır (ileri atlama sunucuda 409'dur).
    expect(calls).toEqual(["start:practice", "case:1"]);

    for (let index = 1; index <= 10; index += 1) {
      const chosen = 2; // "Seçenek C" → maddenin 3. jetonu
      const check = await bridge.port.check(index, chosen);
      expect(check).toEqual({ correct: true, correctIndex: 2, feedback: "Gerekçe" });
      await bridge.port.answer(index, chosen);
      expect(calls.filter((call) => call === `case:${index}`)).toHaveLength(1);
      if (index < 10) expect(calls.filter((call) => call === `case:${index + 1}`)).toHaveLength(1);
    }
    await bridge.port.finish();
    expect(calls).toContain("finish");
    expect(calls.filter((call) => call.startsWith("case:"))).toHaveLength(10);
    expect(bridge.port.results?.passed).toBe(true);
  });

  it("seçim indeksi ↔ opak jeton eşlemesi doğru; sunucu yanıtı indekse çevrilir", async () => {
    const { source, calls } = fakeSessions();
    const bridge = createPulseServerItemsBridge(source);
    await bridge.start("case");
    await bridge.port.check(1, 2);
    expect(calls).toContain("check:1:q:tok_ccccc001");
    await bridge.port.answer(1, 4);
    expect(calls).toContain("answer:1");
    const check = await bridge.port.check(1, 0);
    expect(check.correct).toBe(false);
    expect(check.correctIndex).toBe(2);
  });

  it("değerlendirme: her maddede answer; finish sonuçları port'a ve olaya yazılır", async () => {
    const { source, calls } = fakeSessions({
      getCase: async (_id, index) => publicCase(index, "quiz") as never,
      finish: async () => ({ mode: "assessment", total: 60, max: 100, passed: false, cases: [{ ...RESULT, total: 60, mastery: false }], xpGained: 20 }),
    });
    const events: string[] = [];
    const globals = new Map<string, unknown>();
    const bridge = createPulseServerItemsBridge(source, { onEvent: (type) => events.push(type) });
    bridge.attach({
      shadow: fakeShadow(),
      global: () => ({ showView: () => undefined, serverItemsLoaded: () => undefined }),
      setGlobal: (name: string, value: unknown) => globals.set(name, value),
      emit: (type: string, detail: unknown) => {
        events.push(type);
        bridge.bridge.onEvent?.(type, detail);
      },
    } as never);
    await bridge.start("quiz");
    for (let index = 1; index <= 10; index += 1) await bridge.port.answer(index, 0);
    expect(calls.filter((call) => call.startsWith("answer:"))).toHaveLength(10);
    await bridge.port.finish();
    expect(bridge.port.results).toMatchObject({ mode: "assessment", total: 60, passed: false });
    expect(globals.get(PULSE_SERVER_RESULTS_GLOBAL)).toBe(bridge.port.results);
    expect(events).toContain(PULSE_SERVER_RESULT_EVENT);
    // Runtime'ın okuduğu gölge pencere adları sözleşmedir.
    expect(PULSE_SERVER_ITEMS_GLOBAL).toBe("__pulseServerItems");
    expect(PULSE_SERVER_RESULTS_GLOBAL).toBe("__pulseServerResults");
  });

  it("kanal hatasında durum error olur; Türkçe ileti korunur", async () => {
    const { source } = fakeSessions({ start: async () => Promise.reject(new Error("network down")) });
    const bridge = createPulseServerItemsBridge(source);
    await bridge.start("case");
    expect(bridge.port.status).toBe("error");
    expect(bridge.port.section).toBeNull();
    expect(bridge.port.error).toContain("Sunucuya ulaşılamadı");
  });
});

// --- Kanal yokken kart kilidi (gölge kök sahtesi) -----------------------------

interface FakeView {
  readonly MutationObserver: new (callback: () => void) => { observe(target: unknown, options: unknown): void; disconnect(): void; connected: boolean };
}

let observed = 0;
let disconnected = 0;

class FakeElement {
  readonly classes: string[] = [];
  readonly attrs = new Map<string, string>();
  readonly listeners = new Map<string, ((event: unknown) => void)[]>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  textContent = "";
  innerHTML = "";
  hidden = false;
  disabled = false;
  id = "";

  constructor(readonly tag: string, readonly view: FakeView) {}

  get classList() {
    return {
      add: (...names: string[]) => {
        for (const name of names) if (!this.classes.includes(name)) this.classes.push(name);
      },
      contains: (name: string) => this.classes.includes(name),
      remove: (name: string) => {
        const index = this.classes.indexOf(name);
        if (index >= 0) this.classes.splice(index, 1);
      },
    };
  }

  set className(value: string) {
    this.classes.splice(0, this.classes.length, ...value.split(/\s+/).filter(Boolean));
  }

  get className(): string {
    return this.classes.join(" ");
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  insertBefore(node: FakeElement, ref: FakeElement | null): void {
    node.parent = this;
    const index = ref === null ? -1 : this.children.indexOf(ref);
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
  }

  insertAdjacentElement(_position: string, node: FakeElement): void {
    this.append(node);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
    if (name === "id") this.id = value;
    if (name === "disabled") this.disabled = true;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attrs.delete(name);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(): void {
    /* sahte: kaldırma izlenmez */
  }

  querySelector(selector: string): FakeElement | null {
    return this.query(selector, false)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.query(selector, false);
  }

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }

  private query(selector: string, all: boolean): FakeElement[] {
    const space = selector.indexOf(" ");
    if (space >= 0) {
      const root = this.query(selector.slice(0, space), false)[0];
      return root === undefined ? [] : root.query(selector.slice(space + 1), all);
    }
    const found: FakeElement[] = [];
    const walk = (node: FakeElement): void => {
      for (const child of node.children) {
        if (matches(child, selector)) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
}

function matches(node: FakeElement, selector: string): boolean {
  const parsed = /^([a-z]*)((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(selector);
  if (parsed === null) return false;
  const [, tag, classPart, attrPart] = parsed;
  if (tag !== undefined && tag.length > 0 && node.tag !== tag) return false;
  for (const name of (classPart ?? "").split(".").filter(Boolean)) if (!node.classes.includes(name)) return false;
  for (const attr of (attrPart ?? "").matchAll(/\[([\w-]+)(?:=(["']?)([^"'\]]*)\2)?\]/g)) {
    const value = attr[3];
    if (!node.attrs.has(attr[1] ?? "")) return false;
    if (value !== undefined && node.attrs.get(attr[1] ?? "") !== value) return false;
  }
  return true;
}

function fakeView(): FakeView {
  return {
    MutationObserver: class {
      connected = false;
      constructor(readonly callback: () => void) {}
      observe(): void {
        this.connected = true;
        observed += 1;
      }
      disconnect(): void {
        this.connected = false;
        disconnected += 1;
      }
      refresh(): void {
        this.callback();
      }
    },
  };
}

function fakeShadow(): { getElementById(id: string): FakeElement | null; ownerDocument: { createElement(tag: string): FakeElement; defaultView: FakeView }; addEventListener(): void; removeEventListener(): void; querySelectorAll(selector: string): FakeElement[] } {
  const view = fakeView();
  const cards = new FakeElement("div", view);
  cards.setAttribute("id", "modeCards");
  for (const [kind, view1] of [["practice", "case"], ["assessment", "quiz"]] as const) {
    const card = new FakeElement("article", view);
    card.className = `mode-card ${kind}`;
    const desc = new FakeElement("p", view);
    desc.className = "desc";
    const button = new FakeElement("button", view);
    button.setAttribute("data-view", view1);
    card.append(desc, button);
    cards.append(card);
  }
  return {
    getElementById: (id: string) => (id === "modeCards" ? cards : null),
    ownerDocument: {
      createElement: (tag: string) => new FakeElement(tag, view),
      defaultView: view,
    },
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    querySelectorAll: (selector: string) => cards.querySelectorAll(selector),
  };
}

describe("Pulse kanalsız kurulum — kart kilidi", () => {
  it("uygulama ve değerlendirme kartları sunucu bağlantısı isteğiyle kapanır", () => {
    observed = 0;
    disconnected = 0;
    const shadow = fakeShadow();
    const detach = attachPulseServerRequired({ shadow } as never);
    for (const view of ["case", "quiz"] as const) {
      const button = shadow.querySelectorAll(`button[data-view="${view}"]`)[0];
      expect(button?.disabled).toBe(true);
      expect(button?.innerHTML).toContain(PULSE_SERVER_REQUIRED_TEXT);
      expect(button?.getAttribute("data-eg-server-locked")).toBe("1");
    }
    const practice = shadow.getElementById("modeCards")?.querySelector(".mode-card.practice");
    expect(practice?.querySelector(".eg-lock-note")?.textContent).toBe(PULSE_SERVER_REQUIRED_TEXT);
    expect(observed).toBe(1);
    detach();
    expect(disconnected).toBe(1);
  });
});
