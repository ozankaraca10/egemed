/// <reference lib="dom" />
/**
 * A3.3 — Pulse vaka ve sınav maddelerini sunucu oturumuna bağlar (ADR-009).
 *
 * Mount bağlamındaki `sessions` (SimSessionSource) kanalından maddeler yüklenir;
 * runtime'a `window.__pulseServerItems` (gölge pencere) üzerinden verilir. Madde
 * biçimi runtime'ın beklediği alanlara uyarlanır: `options` yalnız genel seçenek
 * etiketleridir; `correct`/`explanations`/`feedback` ASLA taşınmaz (cevap anahtarı
 * istemcide yoktur). Seçim indeksi ↔ opak jeton eşlemesi yalnız bu köprüde tutulur.
 *
 * Akış: `startSection(section)` yeni sunucu oturumu açar ve ilk maddeyi yükler;
 * sunucu sıralı açılış ister (A1 §3: "vakalar sırayla açılır; ileri atlama 409"),
 * bu yüzden sonraki madde bir önceki yanıtlanır yanıtlanmaz ÖNCEDEN yüklenir.
 * Uygulamada `check` anında geri bildirim verir; her maddede `answer`, sondan
 * sonra `finish` çağrılır. Sonuçlar `window.__pulseServerResults`e yazılır ve
 * `pulse:server-result` olayı yayınlanır.
 */
import type { SimSessionSource } from "@egemed/sim-host";
import type { PulseRuntimeBridge, PulseRuntimeHandle } from "./host";

/** Gölge pencerede maddelerin okunduğu ad (runtime `getItem` buradan döner). */
export const PULSE_SERVER_ITEMS_GLOBAL = "__pulseServerItems";
/** Gölge pencerede biteyen oturumun sonuçları. */
export const PULSE_SERVER_RESULTS_GLOBAL = "__pulseServerResults";
/** Bitiş sonuçları yayınlandığında gönderilen olay (köprüye de iletilir). */
export const PULSE_SERVER_RESULT_EVENT = "pulse:server-result";
/** Oturum kanalı yokken uygulama/değerlendirme kartlarının kapalı metni. */
export const PULSE_SERVER_REQUIRED_TEXT = "Bu mod için sunucu bağlantısı gerekir";
/** Pulse maddeleri tek soruludur; banka `QUESTION_ID` ile aynıdır. */
export const PULSE_QUESTION_ID = "q";

/** Sunucu oturumu olmadan yanıt/telemetri yoktur (dinleme jetonu Pulse'ta yok). */
const EMPTY_TELEMETRY = {
  visits: {} as Record<string, { dwellMs: number; listenMs: number; visits: number; firstOrder: number }>,
  order: [] as string[],
  headChanges: 0,
  headUse: { bell: 0, diaphragm: 0 },
  replayCount: 0,
};

/** `pulsePublicCaseSchema`in yapısal eşi (paket contracts'a bağımlı değildir). */
export interface PulseServerPublicCase {
  readonly simId: string;
  readonly index: number;
  readonly label: string;
  readonly section: "case" | "quiz";
  readonly stem: string;
  readonly question: string;
  readonly vitals: readonly { readonly label: string; readonly value: string }[];
  readonly options: readonly { readonly id: string; readonly label: string }[];
  readonly ecg: {
    readonly mode: string;
    readonly options: Readonly<Record<string, string | number | boolean>>;
    readonly leads: readonly string[];
    readonly start: number;
    readonly seconds: number;
  };
}

/** Runtime'ın beklediği madde biçimi (müfredat maddesiyle alan alan örtüşür). */
export interface PulseServerRuntimeItem {
  readonly id: string;
  readonly title: string;
  readonly stem: string;
  readonly question: string;
  /** Runtime sınav ekranı soru metnini `text`ten okur (müfredat aynası). */
  readonly text: string;
  readonly vitals: readonly { readonly k: string; readonly v: string }[];
  readonly options: readonly string[];
  readonly ecg: PulseServerPublicCase["ecg"];
  /** EKG canvas'ının erişilebilir adı (müfredat maddesinde de vardır). */
  readonly ariaLabel: string;
}

/** Uygulamada anında geri bildirim; doğru seçenek jetonu indekse çevrilir. */
export interface PulseServerCheck {
  readonly correct: boolean;
  readonly correctIndex: number | null;
  readonly feedback: string;
}

/** Bitmiş oturumun madde sonucu (rapor ekranı bu veriden çizilir). */
export interface PulseServerResultCase {
  readonly index: number;
  readonly title: string;
  readonly score: number;
  readonly correct: boolean;
  readonly feedback: string;
  readonly correctIndex: number | null;
}

export interface PulseServerResults {
  readonly mode: string;
  readonly total: number;
  readonly max: number;
  readonly passed: boolean;
  readonly cases: readonly PulseServerResultCase[];
}

/** Runtime'ın `window.__pulseServerItems` üzerinden gördüğü canlı köprü. */
export interface PulseServerItemsPort {
  readonly section: "case" | "quiz" | null;
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly error: string | null;
  readonly sessionId: string | null;
  readonly caseCount: number;
  /** Yüklenen maddeler (indeks boşlukları `undefined`; sıralı açılış kuralı). */
  readonly items: readonly (PulseServerRuntimeItem | undefined)[];
  readonly feedback: Readonly<Record<number, PulseServerCheck>>;
  readonly results: PulseServerResults | null;
  /** Eksik maddeyi arka planda yükler; gelince görünüm tazelenir. */
  loadItem(index: number): void;
  /** Uygulama: seçili seçeneği (indeks) jetona çevirip sunucuda kontrol eder. */
  check(index: number, optionIndex: number): Promise<PulseServerCheck>;
  /** Yanıtı oturuma gönderir ve sonraki maddeyi önceden yükler. */
  answer(index: number, optionIndex: number): Promise<void>;
  /** Oturumu kapatır; sonuçlar `results`e ve `__pulseServerResults`e yazılır. */
  finish(): Promise<PulseServerResults>;
}

export interface PulseServerItemsBridge {
  readonly port: PulseServerItemsPort;
  /** Öğrenme köprüsüyle zincirlenir (`pulse:*` olayları kaybolmaz). */
  readonly bridge: PulseRuntimeBridge;
  /** Bölüm oturumunu baştan açar (mod kartı tıklaması; testler bu yolu kullanır). */
  start(section: "case" | "quiz"): Promise<void>;
  /** Gölge kökte kart tıklamalarını bağlar; dönen işlev çözer. */
  attach(handle: PulseRuntimeHandle): () => void;
}

interface PulseControllerLike {
  showView?: (view: string) => void;
  serverItemsLoaded?: (section: "case" | "quiz") => void;
}

/** API hata kodunu kullanıcı iletisine çevirir (ayrıntı sızdırılmaz). */
export function pulseServerErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/case_time_exceeded/.test(text)) return "Bu maddenin süresi doldu; yanıt boş sayıldı.";
  if (/session_time_exceeded/.test(text)) return "Oturum süresi doldu.";
  if (/session_(expired|finished)/.test(text)) return "Oturum sona erdi. Yeni bir oturum başlatın.";
  if (/rate_limited/.test(text)) return "Çok sık oturum açıldı; biraz sonra yeniden deneyin.";
  if (/forbidden|role_not_permitted|unauthorized/.test(text)) return "Bu işlem için yetkiniz yok.";
  return "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.";
}

/** Sunucu gövdesi `pulsePublicCaseSchema` ile uyumlu mu (yapısal kapı). */
export function asPulsePublicCase(value: unknown): PulseServerPublicCase | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Partial<PulseServerPublicCase>;
  if (row.simId !== "pulse" || (row.section !== "case" && row.section !== "quiz")) return null;
  if (typeof row.stem !== "string" || typeof row.question !== "string" || !Array.isArray(row.options)) return null;
  if (!Array.isArray(row.vitals) || typeof row.ecg !== "object" || row.ecg === null) return null;
  if (!Array.isArray(row.ecg.leads) || typeof row.ecg.mode !== "string") return null;
  return row as PulseServerPublicCase;
}

/** Anahtarsız sunucu maddesini runtime maddesine uyarlar (cevap alanları yok). */
export function adaptServerItem(publicCase: PulseServerPublicCase): PulseServerRuntimeItem {
  return {
    id: publicCase.label,
    title: publicCase.label,
    stem: publicCase.stem,
    question: publicCase.question,
    text: publicCase.question,
    vitals: publicCase.vitals.map(({ label, value }) => ({ k: label, v: value })),
    options: publicCase.options.map((option) => option.label),
    ecg: {
      mode: publicCase.ecg.mode,
      options: { ...publicCase.ecg.options },
      leads: [...publicCase.ecg.leads],
      start: publicCase.ecg.start,
      seconds: publicCase.ecg.seconds,
    },
    ariaLabel: `Sentetik EKG kaydı · ${publicCase.label}`,
  };
}

/**
 * Sunucu kanalını Pulse runtime'ına bağlar. `attach` çağrılmadan yalnız port
 * kullanılabilir (testler); runtime bağlandığında mod kartları tıklaması
 * oturumu açar ve madde yüklemesi görünümü tazeler.
 */
export function createPulseServerItemsBridge(sessions: SimSessionSource, downstream?: PulseRuntimeBridge): PulseServerItemsBridge {
  let handle: PulseRuntimeHandle | null = null;
  let controller: PulseControllerLike | null = null;
  let section: "case" | "quiz" | null = null;
  let status: PulseServerItemsPort["status"] = "idle";
  let error: string | null = null;
  let sessionId: string | null = null;
  let caseCount = 0;
  let items: (PulseServerRuntimeItem | undefined)[] = [];
  let tokens: (readonly string[])[] = [];
  let feedback: Record<number, PulseServerCheck> = {};
  let results: PulseServerResults | null = null;
  const pending = new Map<number, Promise<PulseServerRuntimeItem>>();

  const tokenAt = (index: number, optionIndex: number): string => {
    const token = tokens[index - 1]?.[optionIndex];
    if (sessionId === null || token === undefined) throw new Error("conflict case_not_open");
    return token;
  };
  const indexOfToken = (index: number, token: string | undefined): number | null => {
    if (token === undefined) return null;
    const position = tokens[index - 1]?.indexOf(token) ?? -1;
    return position < 0 ? null : position;
  };

  const ensureItem = (index: number): Promise<PulseServerRuntimeItem> => {
    const loaded = items[index - 1];
    if (loaded !== undefined) return Promise.resolve(loaded);
    const inflight = pending.get(index);
    if (inflight !== undefined) return inflight;
    if (sessionId === null) return Promise.reject(new Error("conflict case_not_open"));
    const promise = sessions.getCase(sessionId, index).then((value: unknown) => {
      const publicCase = asPulsePublicCase(value);
      if (publicCase === null) throw new Error("not_found");
      const item = adaptServerItem(publicCase);
      items[index - 1] = item;
      tokens[index - 1] = publicCase.options.map((option) => option.id);
      return item;
    });
    pending.set(index, promise);
    return promise.finally(() => pending.delete(index));
  };

  const claim = (target: "case" | "quiz"): void => {
    controller?.serverItemsLoaded?.(target);
    controller?.showView?.(target);
  };

  const showResults = (payload: PulseServerResults): void => {
    results = payload;
    handle?.setGlobal(PULSE_SERVER_RESULTS_GLOBAL, payload);
    handle?.emit(PULSE_SERVER_RESULT_EVENT, payload);
  };

  const startSection = async (target: "case" | "quiz"): Promise<void> => {
    status = "loading";
    error = null;
    results = null;
    feedback = {};
    try {
      const session = await sessions.start(target === "case" ? "practice" : "assessment");
      section = target;
      sessionId = session.sessionId;
      caseCount = session.caseCount;
      items = [];
      tokens = [];
      await ensureItem(1);
      status = "ready";
      claim(target);
    } catch (failure) {
      status = "error";
      section = null;
      sessionId = null;
      error = pulseServerErrorMessage(failure);
    }
  };

  const port: PulseServerItemsPort = {
    get section() {
      return section;
    },
    get status() {
      return status;
    },
    get error() {
      return error;
    },
    get sessionId() {
      return sessionId;
    },
    get caseCount() {
      return caseCount;
    },
    get items() {
      return items;
    },
    get feedback() {
      return feedback;
    },
    get results() {
      return results;
    },
    loadItem(index: number) {
      void ensureItem(index)
        .then(() => {
          if (status === "ready" && section !== null) claim(section);
        })
        .catch(() => undefined);
    },
    async check(index, optionIndex) {
      const response = await sessions.check(sessionId ?? "", index, PULSE_QUESTION_ID, [tokenAt(index, optionIndex)]);
      const check: PulseServerCheck = {
        correct: response.correct,
        correctIndex: indexOfToken(index, response.correctOptionIds[0]),
        feedback: response.feedback,
      };
      feedback[index] = check;
      return check;
    },
    async answer(index, optionIndex) {
      try {
        await sessions.answer(sessionId ?? "", index, {
          answers: { [PULSE_QUESTION_ID]: [tokenAt(index, optionIndex)] },
          telemetry: { ...EMPTY_TELEMETRY, headUse: { ...EMPTY_TELEMETRY.headUse }, order: [...EMPTY_TELEMETRY.order], visits: { ...EMPTY_TELEMETRY.visits } },
        });
      } catch (failure) {
        // Süre aşımında sunucu maddeyi boş sayar ve oturum sürer (sonraki maddeye geçilebilsin).
        if (!/case_time_exceeded/.test(failure instanceof Error ? failure.message : String(failure))) throw failure;
      }
      if (index < caseCount) {
        // Sıralı açılış kuralı: sonraki madde, önceki yanıtlanır yanıtlanmaz önceden yüklenir.
        await ensureItem(index + 1).catch(() => undefined);
      }
    },
    async finish() {
      const done = await sessions.finish(sessionId ?? "");
      const payload: PulseServerResults = {
        mode: done.mode,
        total: done.total,
        max: done.max,
        passed: done.passed,
        cases: done.cases.map((entry) => ({
          index: entry.index,
          title: entry.title,
          score: entry.total,
          correct: entry.questions[0]?.correct === true,
          feedback: entry.questions[0]?.feedback ?? entry.summary,
          correctIndex: indexOfToken(entry.index, entry.questions[0]?.correctOptionIds[0]),
        })),
      };
      showResults(payload);
      return payload;
    },
  };

  const bridge: PulseRuntimeBridge = {
    onEvent(type, detail) {
      // "Yeni örneklem"/"aynı vakaları tekrar dene" yerel oturumu yeniler;
      // sunucu oturumu da aynı bölüm için baştan açılır (ADR-009).
      if (type === "cardai:session") {
        const next = (detail as { section?: unknown } | undefined)?.section;
        if (next === "case" || next === "quiz") void startSection(next);
      }
      downstream?.onEvent?.(type, detail);
    },
  };

  return {
    port,
    bridge,
    start: startSection,
    attach(runtimeHandle) {
      handle = runtimeHandle;
      controller = (runtimeHandle.global("CardAIController") as PulseControllerLike | undefined) ?? null;
      const shadow = runtimeHandle.shadow;
      const modeCards = shadow.getElementById("modeCards");
      const parent = modeCards?.parentElement ?? null;
      const doc = shadow.ownerDocument;
      const statusLine: HTMLElement | null =
        parent === null
          ? null
          : (() => {
              const line = doc.createElement("p");
              line.className = "egemed-pulse-server-status";
              line.setAttribute("role", "status");
              line.setAttribute("aria-live", "polite");
              line.hidden = true;
              parent.insertBefore(line, modeCards);
              return line;
            })();
      const busy = new Map<HTMLButtonElement, boolean>();
      const setStatus = (text: string | null): void => {
        if (statusLine === null) return;
        statusLine.textContent = text ?? "";
        statusLine.hidden = text === null;
      };
      const setBusy = (on: boolean): void => {
        for (const button of Array.from(shadow.querySelectorAll<HTMLButtonElement>("#modeCards button[data-view]"))) {
          if (on) {
            if (!button.disabled && !busy.has(button)) {
              busy.set(button, true);
              button.disabled = true;
            }
          } else if (busy.delete(button)) {
            button.disabled = false;
          }
        }
        setStatus(on ? "Oturum hazırlanıyor…" : error);
      };
      const onClick = (event: Event): void => {
        const target = event.target;
        const button = target instanceof Element ? target.closest<HTMLButtonElement>("#modeCards button[data-view]") : null;
        if (button === null || button.disabled) return;
        const view = button.dataset["view"];
        if (view !== "case" && view !== "quiz") return;
        event.preventDefault();
        event.stopPropagation();
        if (port.section === view && status === "ready") {
          controller?.showView?.(view);
          return;
        }
        setBusy(true);
        void startSection(view).finally(() => setBusy(false));
      };
      shadow.addEventListener("click", onClick, true);
      return () => {
        shadow.removeEventListener("click", onClick, true);
        statusLine?.remove();
        for (const button of busy.keys()) button.disabled = false;
        busy.clear();
        handle = null;
        controller = null;
      };
    },
  };
}

/**
 * Oturum kanalı yokken (API yok, ziyaretçi dışı) uygulama ve değerlendirme
 * kartlarını "Bu mod için sunucu bağlantısı gerekir" ile kapatır (Ausculta/Opaca
 * ile aynı anlam). Kaynak kartları her `renderModes` çağrısında yeniden
 * çizilebildiği için kilit bir gözlemciyle tazelenir.
 */
export function attachPulseServerRequired(runtimeHandle: PulseRuntimeHandle): () => void {
  const shadow = runtimeHandle.shadow;
  const box = shadow.getElementById("modeCards");
  if (box === null) return () => undefined;
  const doc = shadow.ownerDocument;
  const LOCK_ICON =
    '<svg class="eg-lock-ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const apply = (): void => {
    for (const kind of ["practice", "assessment"] as const) {
      const card = box.querySelector(`.mode-card.${kind}`);
      if (card === null) continue;
      card.classList.add("eg-server-locked");
      card.setAttribute("aria-disabled", "true");
      const button = card.querySelector('button[data-view]');
      if (button !== null && button.getAttribute("data-eg-server-locked") !== "1") {
        button.setAttribute("data-eg-server-locked", "1");
        button.setAttribute("disabled", "");
        button.innerHTML = `${LOCK_ICON}<span>${PULSE_SERVER_REQUIRED_TEXT}</span>`;
      }
      if (card.querySelector(".eg-lock-note") === null) {
        const note = doc.createElement("p");
        note.className = "eg-lock-note";
        note.textContent = PULSE_SERVER_REQUIRED_TEXT;
        (card.querySelector(".desc") ?? card).insertAdjacentElement("afterend", note);
      }
    }
  };
  apply();
  // Gözlemci pencereden alınır (Node testlerinde gölge belge sahte pencere verir).
  const Observer = shadow.ownerDocument.defaultView?.MutationObserver;
  if (Observer === undefined) return () => undefined;
  const observer = new Observer(apply);
  observer.observe(box, { childList: true, subtree: true });
  return () => observer.disconnect();
}
