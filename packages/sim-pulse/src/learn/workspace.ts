/**
 * T298 — Pulse öğrenme modu çalışma alanı (gerçek 12 derivasyon EKG).
 *
 * Kaynak runtime'ın `#simView` öğrenme alanı (ritim sekmeleri, sentetik EKG,
 * transport) gizlenir; yerine üç sütun gelir: patern rayı · kalp kesiti ve
 * öğretim üyesinin seçtiği kayıtlar · 12 derivasyon kâğıt + EKG altında sabit
 * "Bu patern hakkında". İlerleme kaynağın `state.viewed[mod]` sayacına (≥16 s)
 * yazılır; böylece vaka/sınav kilidi, `pulse:learn-complete` ve oyunlaştırma
 * köprüsü değişmeden çalışır.
 */
import manifest from "../data/realEcg.json";
import type { PulseRuntimeHandle } from "../runtime/host";
import { heartProfileFor, learnTextFor, PULSE_VENDOR_MODE } from "./content";
import { PULSE_ECG_FS, PULSE_ECG_LEADS, pulseEcgRecord, pulseRhythmStats } from "./ecg";
import type { PulseEcgRecord, PulseRhythmStats } from "./ecg";
import { PULSE_HEART_SVG, PulseHeartAnimator } from "./heart";
import { PULSE_LEARN_CSS } from "./styles";

interface ManifestRef {
  readonly id: string;
  readonly source: string;
  readonly file: string;
}
interface ManifestPattern {
  readonly key: string;
  readonly name: string;
  readonly group: string;
  readonly urgent: boolean;
  readonly refs: readonly ManifestRef[];
  readonly status: string;
}
interface ManifestSource {
  readonly title: string;
  readonly license: string;
}

const PATTERNS = (manifest as { patterns: readonly ManifestPattern[] }).patterns;
const SOURCES = (manifest as unknown as { sources: Readonly<Record<string, ManifestSource>> }).sources;

/** Bir paterni "incelendi" saymak için gereken süre (kaynakla aynı: 16 s). */
export const PULSE_LEARN_SECONDS = 16;
const EXTRA_KEY = "pulse.learn.extra";

interface Controller {
  readonly state: { activeView: string; mode: string; viewed: Record<string, number> };
  setMode?(mode: string, resetTime?: boolean): void;
  setPlaying?(on: boolean): void;
  persist?(): void;
}

export interface PulseLearnWorkspaceOptions {
  /** `/sims/pulse/` gibi; sonda `/`. */
  readonly assetBase: string;
  /** Test ve sunucusuz kurulum için kayıt yükleyici. */
  readonly fetchRecord?: (url: string) => Promise<ArrayBuffer>;
}

const SPEEDS = [25, 50] as const;
const GAINS = [5, 10, 20] as const;
const LAYOUT = [[0, 3, 6, 9], [1, 4, 7, 10], [2, 5, 8, 11]] as const;

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

function markup(): string {
  return `<div class="pl" data-pl="root">
<nav class="pl-rail" aria-label="Paternler"><h2>Paternler · <span data-pl="done">0</span>/<span data-pl="total">0</span></h2><div data-pl="list"></div></nav>
<section class="pl-left" aria-label="Kalp ve kayıt">
  <div class="pl-title"><span class="pl-eb" data-pl="group"></span><h2 data-pl="name"></h2><span class="pl-urg" data-pl="urgent" hidden>⚠ ACİL</span></div>
  <div class="pl-study"><span data-pl="studyText"></span><i aria-hidden="true"><b data-pl="studyBar" style="width:0%"></b></i></div>
  <div class="pl-heart" role="img" data-pl="heartBox" aria-label="Kalp kesiti animasyonu">
    <span class="pl-bpm" aria-hidden="true"><span data-pl="bpm">—</span><small>/dk</small></span>
    ${PULSE_HEART_SVG}
    <span class="pl-hlabel" data-pl="hstate" aria-live="off">Diyastol</span>
  </div>
  <div><div class="pl-lbl" id="pl-recs-label">Öğretim Üyesinin Seçtiği Kayıtlar</div><div class="pl-recs" role="group" aria-labelledby="pl-recs-label" data-pl="recs"></div></div>
  <div class="pl-meas">
    <div class="pl-m"><b data-pl="rate">—</b><span>Hız (ölçülen)</span></div>
    <div class="pl-m"><b data-pl="rr">—</b><span>RR ortanca</span></div>
    <div class="pl-m"><b data-pl="reg">—</b><span>RR düzeni</span></div>
  </div>
  <p class="pl-src" data-pl="src"></p>
</section>
<section class="pl-right" aria-label="12 derivasyon EKG">
  <div class="pl-tools">
    <button class="pl-tb pl-play" type="button" data-pl="play">▶ Oynat</button>
    <span class="pl-lbl" id="pl-speed-label">Hız</span>
    <div class="pl-seg" role="group" aria-labelledby="pl-speed-label" data-pl="speed">${SPEEDS.map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === 25}">${v} mm/s</button>`).join("")}</div>
    <span class="pl-lbl" id="pl-gain-label">Kazanç</span>
    <div class="pl-seg" role="group" aria-labelledby="pl-gain-label" data-pl="gain">${GAINS.map((v) => `<button type="button" data-v="${v}" aria-pressed="${v === 10}">${v === 20 ? "20 mm/mV" : v}</button>`).join("")}</div>
    <button class="pl-tb" type="button" data-pl="calBtn" aria-pressed="true">⟷ Kaliper</button>
  </div>
  <div class="pl-paper" data-pl="paper">
    <canvas data-pl="canvas" role="img" aria-label="12 derivasyon EKG, 4×3 düzen ve DII ritim şeridi"></canvas>
    <div class="pl-cal" data-pl="cal" tabindex="0" role="slider" aria-label="Kaliper konumu" aria-valuemin="0" aria-valuemax="10" aria-valuenow="0"><i class="pl-a"></i><span class="pl-bridge"></span><i class="pl-b"></i><span class="pl-read" data-pl="calRead"></span></div>
    <div class="pl-msg" data-pl="msg" hidden></div>
  </div>
  <div class="pl-calrow" data-pl="calrow">Kaliper: kollar kilitli, bütün olarak sürükleyin · aralık
    <button class="pl-tb" type="button" data-d="-20">−20 ms</button><button class="pl-tb" type="button" data-d="20">+20 ms</button><button class="pl-tb" type="button" data-pl="calRR">RR'ye eşitle</button>
  </div>
  <section class="pl-about" aria-labelledby="pl-about-name">
    <div class="pl-about-head"><span class="pl-eb" data-pl="aGroup"></span><h3 id="pl-about-name" data-pl="aName"></h3><span class="pl-lbl">Bu patern hakkında</span></div>
    <div class="pl-alert" data-pl="aAlert" hidden>Acil: hayatı tehdit eden ya da acil müdahale gerektiren patern.</div>
    <div class="pl-grid">
      <div class="pl-card"><div class="pl-lbl">Rehber ölçütü</div><div class="pl-crit" data-pl="crit"></div></div>
      <div class="pl-card"><div class="pl-lbl">Bu kayıtta bakın</div><ul class="pl-look" data-pl="look"></ul></div>
      <div class="pl-card"><div class="pl-lbl">Kalpte ne oluyor?</div><p class="pl-mech" data-pl="mech"></p></div>
    </div>
    <p class="pl-src">Ölçütler: AHA/ACCF/HRS EKG standartları · 4. Evrensel MI Tanımı · ESC 2023 AKS kılavuzu</p>
  </section>
</section>
</div>`;
}

function readExtra(storage: Storage): Record<string, number> {
  try {
    const raw = JSON.parse(storage.getItem(EXTRA_KEY) ?? "{}") as unknown;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "number" && Number.isFinite(v)) out[k] = Math.max(0, Math.min(PULSE_LEARN_SECONDS, v));
    return out;
  } catch {
    return {};
  }
}

/** Öğrenme çalışma alanını kurar; dönen işlev her şeyi geri alır. */
export function attachPulseLearnWorkspace(handle: PulseRuntimeHandle, options: PulseLearnWorkspaceOptions): () => void {
  const shadow = handle.shadow;
  const simView = shadow.getElementById("simView");
  const controller = handle.global("CardAIController") as Controller | undefined;
  if (simView === null || controller === undefined) return () => undefined;
  const ctl: Controller = controller;

  const style = document.createElement("style");
  style.textContent = PULSE_LEARN_CSS;
  shadow.append(style);
  const host = document.createElement("div");
  host.innerHTML = markup();
  const root = host.firstElementChild as HTMLElement;
  simView.classList.add("pl-active");
  simView.prepend(root);
  ctl.setPlaying?.(false);

  const $ = <T extends Element = HTMLElement>(name: string): T => root.querySelector(`[data-pl="${name}"]`) as T;
  // Kaynağın açılışı odağı seçili ritim sekmesine verir; sekmeler artık gizli
  // olduğundan odak kaybolmasın diye görünür başlığa taşınır.
  const active = shadow.activeElement as HTMLElement | null;
  if (active !== null && active.getClientRects().length === 0) {
    const view = ctl.state.activeView;
    const heading = view === "sim" ? $("name") : shadow.getElementById(view === "modes" ? "modesTitle" : `${view}Title`);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }
  const heart = new PulseHeartAnimator(root);
  const canvas = $<HTMLCanvasElement>("canvas");
  const ctx = canvas.getContext("2d");
  const fetchRecord = options.fetchRecord ?? (async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Pulse EKG: ${response.status}`);
    return response.arrayBuffer();
  });

  const extra = readExtra(handle.storage);
  const cache = new Map<string, Promise<PulseEcgRecord>>();
  const available = PATTERNS.filter((p) => p.status === "ready" && p.refs.length > 0);
  const required = available.filter((p) => PULSE_VENDOR_MODE[p.key] !== undefined);

  const initialKey = (): string => {
    const byMode = available.find((p) => PULSE_VENDOR_MODE[p.key] === ctl.state.mode);
    return byMode?.key ?? available[0]?.key ?? "normal";
  };
  let current = initialKey();
  let refIndex = 0;
  let record: PulseEcgRecord | null = null;
  let stats: PulseRhythmStats = { rrMedian: null, rate: null, cv: null, regular: null };
  let loadToken = 0;
  let playing = false;
  let tNow = 0;
  let startedAt = 0;
  let raf = 0;
  let mmPerS: number = 25;
  let mmPerMv: number = 10;
  let calOn = true;
  let calStart = 1;
  let calSpan = 0.8;
  let disposed = false;

  const viewedSeconds = (key: string): number => {
    const mode = PULSE_VENDOR_MODE[key];
    if (mode !== undefined) return Math.min(PULSE_LEARN_SECONDS, ctl.state.viewed[mode] ?? 0);
    return extra[key] ?? 0;
  };
  const isDone = (key: string): boolean => viewedSeconds(key) >= PULSE_LEARN_SECONDS;

  // --- Patern rayı -----------------------------------------------------------
  function renderList(): void {
    const list = $("list");
    list.textContent = "";
    let group: string | null = null;
    for (const p of PATTERNS) {
      if (p.group !== group) {
        group = p.group;
        const h = document.createElement("div");
        h.className = "pl-grp";
        h.textContent = group;
        list.append(h);
      }
      const ready = p.status === "ready" && p.refs.length > 0;
      const done = ready && isDone(p.key);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pl-pt";
      b.dataset.key = p.key;
      b.disabled = !ready;
      if (!ready) b.title = "Kayıt bekleniyor";
      if (p.key === current) b.setAttribute("aria-current", "true");
      const optional = ready && PULSE_VENDOR_MODE[p.key] === undefined;
      b.innerHTML = `<span class="pl-ck${done ? " pl-done" : ""}" aria-hidden="true">${done ? "✓" : ""}</span><span>${esc(p.name)}</span>${
        p.urgent ? '<span class="pl-tag">ACİL</span>' : optional ? '<span class="pl-tag pl-extra" title="Kilidi etkilemez">EK</span>' : ""
      }`;
      b.setAttribute("aria-label", `${p.name}${p.urgent ? ", acil" : ""}${done ? ", incelendi" : ""}${ready ? "" : ", kayıt bekleniyor"}`);
      b.addEventListener("click", () => select(p.key));
      list.append(b);
    }
    $("total").textContent = String(required.length);
    $("done").textContent = String(required.filter((p) => isDone(p.key)).length);
  }

  function renderStudy(): void {
    const s = viewedSeconds(current);
    const optional = PULSE_VENDOR_MODE[current] === undefined;
    $("studyText").textContent = s >= PULSE_LEARN_SECONDS
      ? "İncelendi ✓"
      : `İnceleme ${Math.floor(s)}/${PULSE_LEARN_SECONDS} s${optional ? " · ek patern" : ""}`;
    $("studyBar").style.width = `${(s / PULSE_LEARN_SECONDS) * 100}%`;
  }

  // --- Seçim ve yükleme ------------------------------------------------------
  function select(key: string, ref = 0): void {
    const p = PATTERNS.find((x) => x.key === key);
    if (p === undefined || p.status !== "ready" || p.refs.length === 0) return;
    current = key;
    refIndex = Math.min(ref, p.refs.length - 1);
    const mode = PULSE_VENDOR_MODE[key];
    if (mode !== undefined && ctl.state.mode !== mode) {
      ctl.setMode?.(mode, true);
      ctl.setPlaying?.(false);
    }
    $("group").textContent = p.group;
    $("name").textContent = p.name;
    $("urgent").hidden = !p.urgent;
    const text = learnTextFor(key);
    $("aGroup").textContent = p.group;
    $("aName").textContent = p.name;
    $("aAlert").hidden = !p.urgent;
    $("crit").textContent = text?.crit ?? "";
    $("look").innerHTML = (text?.look ?? []).map((x) => `<li>${esc(x)}</li>`).join("");
    $("mech").textContent = text?.mech ?? "";
    const recs = $("recs");
    recs.textContent = "";
    p.refs.forEach((r, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pl-rec";
      b.textContent = r.id;
      b.setAttribute("aria-pressed", String(i === refIndex));
      b.setAttribute("aria-label", `Kayıt ${i + 1}: ${r.id}`);
      b.addEventListener("click", () => select(key, i));
      recs.append(b);
    });
    renderList();
    renderStudy();
    void load(p, p.refs[refIndex] as ManifestRef);
  }

  async function load(p: ManifestPattern, ref: ManifestRef): Promise<void> {
    const token = ++loadToken;
    record = null;
    showMessage("Kayıt yükleniyor…");
    const source = SOURCES[ref.source];
    $("src").textContent = `Kaynak: ${source?.title ?? ref.source} · ${source?.license ?? ""} · ${ref.id} · 12 derivasyon, 10 s`;
    let promise = cache.get(ref.file);
    if (promise === undefined) {
      promise = fetchRecord(`${options.assetBase}${ref.file}`).then(pulseEcgRecord);
      cache.set(ref.file, promise);
    }
    try {
      const loaded = await promise;
      if (disposed || token !== loadToken || current !== p.key) return;
      record = loaded;
      stats = pulseRhythmStats(loaded.r);
      showMessage(null);
      const chaos = heartProfileFor(p.key).vent === "chaos";
      $("rate").textContent = chaos || stats.rate === null ? "—" : `${stats.rate}/dk`;
      $("bpm").textContent = chaos || stats.rate === null ? "—" : String(stats.rate);
      $("rr").textContent = chaos || stats.rrMedian === null ? "—" : `${Math.round(stats.rrMedian * 1000)} ms`;
      $("reg").textContent = chaos || stats.regular === null ? "QRS yok" : stats.regular ? "Düzenli" : "Düzensiz";
      calSpan = chaos || stats.rrMedian === null ? 0.2 : stats.rrMedian;
      calStart = loaded.r[1] ?? loaded.r[0] ?? 1;
      draw();
      drawHeart();
    } catch {
      if (token !== loadToken) return;
      cache.delete(ref.file);
      showMessage("Kayıt yüklenemedi.", () => select(p.key, refIndex));
    }
  }

  function showMessage(text: string | null, retry?: () => void): void {
    const msg = $("msg");
    msg.hidden = text === null;
    msg.textContent = text ?? "";
    if (retry !== undefined) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pl-tb";
      b.textContent = "Yeniden dene";
      b.addEventListener("click", retry);
      msg.append(b);
    }
  }

  // --- 12 derivasyon kâğıt ----------------------------------------------------
  function layout(): { w: number; pxmm: number; secs: number; rowH: number; h: number } {
    const w = Math.max(280, $("paper").clientWidth);
    const secs = (10 * 25) / mmPerS;
    const pxmm = w / (secs * mmPerS);
    const rowH = 30 * pxmm;
    return { w, pxmm, secs, rowH, h: rowH * 4 + 6 * pxmm };
  }

  function draw(): void {
    if (ctx === null) return;
    const L = layout();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(L.w * dpr);
    canvas.height = Math.round(L.h * dpr);
    canvas.style.height = `${L.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#fffaf8";
    ctx.fillRect(0, 0, L.w, L.h);
    for (const [len, horizontal] of [[L.w, true], [L.h, false]] as const) {
      for (let p = 0, i = 0; p <= len; p += L.pxmm, i += 1) {
        ctx.strokeStyle = i % 5 === 0 ? "#eba0ab" : "#f6d7dc";
        ctx.lineWidth = i % 5 === 0 ? 1 : 0.5;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(p, 0);
          ctx.lineTo(p, L.h);
        } else {
          ctx.moveTo(0, p);
          ctx.lineTo(L.w, p);
        }
        ctx.stroke();
      }
    }
    placeCal(L);
    if (record === null) return;
    const colS = L.secs / 4;
    const colW = L.w / 4;
    const perMv = mmPerMv * L.pxmm;
    const perS = mmPerS * L.pxmm;
    ctx.lineJoin = "round";
    ctx.font = "700 11px ui-monospace, Menlo, monospace";
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const li = LAYOUT[row]?.[col] ?? 0;
        const lead = record.leads[li];
        if (lead === undefined) continue;
        const y0 = L.rowH * row + L.rowH * 0.55;
        const from = Math.floor(col * colS * PULSE_ECG_FS);
        const count = Math.floor(colS * PULSE_ECG_FS);
        ctx.strokeStyle = "#14181f";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let k = 0; k <= count; k += 1) {
          const s = Math.min(lead.length - 1, from + k);
          const x = col * colW + (k / PULSE_ECG_FS) * perS;
          const y = y0 - (lead[s] ?? 0) * perMv;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#14181f";
        ctx.fillText(PULSE_ECG_LEADS[li] ?? "", col * colW + 6, L.rowH * row + 14);
        if (col > 0) {
          ctx.beginPath();
          ctx.moveTo(col * colW, y0 - 4);
          ctx.lineTo(col * colW, y0 + 4);
          ctx.stroke();
        }
      }
    }
    const ii = record.leads[1];
    if (ii !== undefined) {
      const yR = L.rowH * 3 + L.rowH * 0.55;
      ctx.beginPath();
      const n = Math.min(ii.length, Math.floor(L.secs * PULSE_ECG_FS));
      for (let k = 0; k < n; k += 1) {
        const x = (k / PULSE_ECG_FS) * perS;
        const y = yR - (ii[k] ?? 0) * perMv;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillText("II · ritim şeridi", 6, L.rowH * 3 + 14);
    }
    if (playing || tNow > 0) {
      const tt = tNow % L.secs;
      ctx.strokeStyle = "rgba(200,30,54,.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tt * perS, L.rowH * 3);
      ctx.lineTo(tt * perS, L.h);
      ctx.stroke();
      const col = Math.floor(tt / colS);
      const xc = col * colW + (tt - col * colS) * perS;
      ctx.strokeStyle = "rgba(200,30,54,.35)";
      ctx.beginPath();
      ctx.moveTo(xc, 0);
      ctx.lineTo(xc, L.rowH * 3);
      ctx.stroke();
    }
  }

  function placeCal(L = layout()): void {
    const cal = $("cal");
    cal.hidden = !calOn || record === null;
    $("calrow").hidden = !calOn;
    if (cal.hidden) return;
    calStart = Math.max(0, Math.min(L.secs - calSpan, calStart));
    const perS = mmPerS * L.pxmm;
    cal.style.left = `${calStart * perS}px`;
    cal.style.width = `${calSpan * perS}px`;
    cal.style.top = `${L.rowH * 3}px`;
    cal.style.height = `${L.rowH}px`;
    const ms = Math.round(calSpan * 1000);
    $("calRead").textContent = `${ms} ms · ${Math.round(60 / calSpan)}/dk`;
    cal.setAttribute("aria-valuenow", calStart.toFixed(2));
    cal.setAttribute("aria-valuetext", `${calStart.toFixed(2)} s, aralık ${ms} ms`);
  }

  function drawHeart(): void {
    if (record === null) return;
    const frame = heart.render(tNow || 0.05, record.r, stats.rrMedian, heartProfileFor(current));
    $("hstate").textContent = frame.label;
  }

  // --- Oynatma ve inceleme süresi ---------------------------------------------
  function tick(now: number): void {
    if (!playing || disposed) return;
    tNow = (now - startedAt) / 1000;
    drawHeart();
    draw();
    raf = requestAnimationFrame(tick);
  }
  function setPlaying(on: boolean): void {
    playing = on;
    $("play").textContent = on ? "❚❚ Durdur" : "▶ Oynat";
    $("play").setAttribute("aria-pressed", String(on));
    cancelAnimationFrame(raf);
    if (on) {
      startedAt = performance.now() - tNow * 1000;
      raf = requestAnimationFrame(tick);
    }
  }

  const studying = (): boolean => {
    if (record === null || document.hidden || ctl.state.activeView !== "sim") return false;
    if (shadow.querySelector("dialog[open]") !== null) return false;
    const r = root.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  let lastTick = performance.now();
  let unsaved = 0;
  const studyTimer = window.setInterval(() => {
    const now = performance.now();
    const dt = Math.min(1, (now - lastTick) / 1000);
    lastTick = now;
    if (!studying() || isDone(current)) return;
    const mode = PULSE_VENDOR_MODE[current];
    if (mode !== undefined) ctl.state.viewed[mode] = Math.min(PULSE_LEARN_SECONDS, (ctl.state.viewed[mode] ?? 0) + dt);
    else extra[current] = Math.min(PULSE_LEARN_SECONDS, (extra[current] ?? 0) + dt);
    unsaved += dt;
    const finished = isDone(current);
    if (finished || unsaved >= 2) {
      unsaved = 0;
      if (mode !== undefined) ctl.persist?.();
      else {
        try {
          handle.storage.setItem(EXTRA_KEY, JSON.stringify(extra));
        } catch {
          // Kayıt alanı doluysa ek paternin işareti yalnız bu oturumda kalır.
        }
      }
    }
    if (finished) renderList();
    renderStudy();
  }, 250);

  // --- Denetimler -----------------------------------------------------------------
  $("play").addEventListener("click", () => setPlaying(!playing));
  $("speed").querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => {
    mmPerS = Number(b.dataset.v);
    $("speed").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    draw();
  }));
  $("gain").querySelectorAll<HTMLButtonElement>("button").forEach((b) => b.addEventListener("click", () => {
    mmPerMv = Number(b.dataset.v);
    $("gain").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    draw();
  }));
  $("calBtn").addEventListener("click", () => {
    calOn = !calOn;
    $("calBtn").setAttribute("aria-pressed", String(calOn));
    placeCal();
  });
  $("calrow").querySelectorAll<HTMLButtonElement>("[data-d]").forEach((b) => b.addEventListener("click", () => {
    calSpan = Math.max(0.04, Math.min(5, calSpan + Number(b.dataset.d) / 1000));
    placeCal();
  }));
  $("calRR").addEventListener("click", () => {
    if (stats.rrMedian !== null) calSpan = stats.rrMedian;
    placeCal();
  });
  const cal = $("cal");
  let dragX = 0;
  let dragStart = 0;
  cal.addEventListener("pointerdown", (ev) => {
    dragX = ev.clientX;
    dragStart = calStart;
    cal.setPointerCapture(ev.pointerId);
    cal.style.cursor = "grabbing";
  });
  cal.addEventListener("pointermove", (ev) => {
    if (!cal.hasPointerCapture(ev.pointerId)) return;
    const L = layout();
    calStart = dragStart + (ev.clientX - dragX) / (mmPerS * L.pxmm);
    placeCal(L);
  });
  cal.addEventListener("pointerup", () => {
    cal.style.cursor = "grab";
  });
  cal.addEventListener("keydown", (ev) => {
    const step = ev.shiftKey ? 0.2 : 0.02;
    if (ev.key === "ArrowLeft") calStart -= step;
    else if (ev.key === "ArrowRight") calStart += step;
    else return;
    ev.preventDefault();
    placeCal();
  });
  const resize = new ResizeObserver(() => draw());
  resize.observe($("paper"));

  select(current);

  return () => {
    disposed = true;
    setPlaying(false);
    window.clearInterval(studyTimer);
    resize.disconnect();
    if (unsaved > 0) {
      if (PULSE_VENDOR_MODE[current] !== undefined) ctl.persist?.();
      else {
        try {
          handle.storage.setItem(EXTRA_KEY, JSON.stringify(extra));
        } catch {
          // yok say
        }
      }
    }
    root.remove();
    style.remove();
    simView.classList.remove("pl-active");
  };
}

/** Testler için: paternlerin listesi ve kilit sayısı. */
export function pulseLearnPatterns(): { readonly all: number; readonly ready: number; readonly required: number } {
  const ready = PATTERNS.filter((p) => p.status === "ready" && p.refs.length > 0);
  return { all: PATTERNS.length, ready: ready.length, required: ready.filter((p) => PULSE_VENDOR_MODE[p.key] !== undefined).length };
}

/** Manifestteki patern kaydı (testler ve kabuk özetleri için). */
export function pulseLearnPattern(key: string): ManifestPattern | undefined {
  return PATTERNS.find((p) => p.key === key);
}
