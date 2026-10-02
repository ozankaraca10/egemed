/**
 * T298 — dört boşluklu kalp kesiti ve kayda kilitli animasyon.
 *
 * Elektriksel ve mekanik olaylar kaydın kendi R tepelerinden türetilir:
 * QRS başlangıcı ≈ R − 40 ms, P başlangıcı = QRS − PR; ventrikül sistolü
 * R + 30 ms'de başlar, ~R + 250 ms'de tepe yapar. Atriyal davranış paterne göre
 * değişir (`PulseHeartProfile`). Görünüm: izleyicinin solu hastanın sağı.
 */
import type { PulseHeartProfile } from "./content";

type Pt = readonly [number, number];
interface Chamber {
  readonly pts: readonly Pt[];
  readonly c: Pt;
  readonly w: number;
  readonly k: number;
  readonly apex?: Pt;
}

const CHAMBERS: Readonly<Record<"RA" | "LA" | "RV" | "LV", Chamber>> = {
  RA: { pts: [[58, 72], [80, 50], [112, 48], [138, 66], [142, 104], [136, 128], [104, 136], [70, 128], [54, 102]], c: [100, 94], w: 6, k: 0.13 },
  LA: { pts: [[162, 66], [188, 48], [220, 50], [242, 72], [246, 102], [230, 128], [196, 136], [164, 128], [158, 104]], c: [202, 94], w: 6, k: 0.13 },
  RV: { pts: [[60, 146], [100, 142], [140, 144], [146, 184], [148, 230], [146, 262], [128, 252], [96, 222], [70, 190], [56, 166]], c: [104, 196], w: 7, k: 0.17, apex: [148, 276] },
  LV: { pts: [[158, 144], [200, 142], [240, 146], [248, 184], [238, 226], [212, 258], [178, 282], [152, 276], [150, 232], [152, 186]], c: [198, 206], w: 12, k: 0.2, apex: [160, 286] },
};
const HULL: readonly Pt[] = [[48, 96], [74, 40], [150, 34], [226, 40], [254, 96], [256, 160], [244, 232], [182, 300], [148, 292], [100, 250], [52, 180]];
const MYO = [176, 44, 66] as const;
const ACT = [255, 214, 140] as const;

/** Kalp SVG'si (gölge kök içinde tek örnek; kimlikler `pl-` önekli). */
export const PULSE_HEART_SVG = `<svg class="pl-heart-svg" viewBox="0 0 300 320" aria-hidden="true" focusable="false">
<defs>
<radialGradient id="pl-blood" cx="50%" cy="40%"><stop offset="0" stop-color="#5a0f1f"/><stop offset="1" stop-color="#2a0710"/></radialGradient>
<radialGradient id="pl-peric-g" cx="50%" cy="45%"><stop offset="0" stop-color="#e2566b"/><stop offset="1" stop-color="#8f1428"/></radialGradient>
<filter id="pl-glow"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<g fill="none" stroke-linecap="round">
<path d="M172 52 C170 22 190 8 214 12 C238 16 250 34 246 54" stroke="#c9364c" stroke-width="16"/>
<path d="M200 12 L198 0 M218 14 L222 2 M234 24 L244 14" stroke="#c9364c" stroke-width="7"/>
<path d="M98 52 L96 6" stroke="#4f6fb8" stroke-width="15"/>
<path d="M150 50 C146 26 128 18 112 22" stroke="#6f8fd0" stroke-width="12"/>
</g>
<path data-h="peric" fill="url(#pl-peric-g)" opacity=".55" d=""/>
<path data-h="RA" fill="url(#pl-blood)" stroke="#b02c42" stroke-width="6" stroke-linejoin="round" d=""/>
<path data-h="LA" fill="url(#pl-blood)" stroke="#b02c42" stroke-width="6" stroke-linejoin="round" d=""/>
<path data-h="RV" fill="url(#pl-blood)" stroke="#b02c42" stroke-width="7" stroke-linejoin="round" d=""/>
<path data-h="LV" fill="url(#pl-blood)" stroke="#b02c42" stroke-width="12" stroke-linejoin="round" d=""/>
<g fill="none" stroke="#f3d9a4" stroke-width="3" stroke-linecap="round"><path data-h="vTri" d=""/><path data-h="vMit" d=""/></g>
<g fill="none" stroke="#ffe6a8" stroke-width="2.5" stroke-linecap="round">
<path data-h="pAtr" d="M84 60 Q116 96 148 136" opacity=".3"/>
<path data-h="pHis" d="M150 140 L150 176" opacity=".3"/>
<path data-h="pRBB" d="M149 176 Q132 222 140 268" opacity=".3"/>
<path data-h="pLBB" d="M151 176 Q196 214 176 270" opacity=".3"/>
<path data-h="pAcc" d="M236 118 Q252 140 240 166" opacity="0" stroke-dasharray="4 4"/>
</g>
<circle data-h="nSA" cx="84" cy="60" r="6.5" fill="#ffd27a" filter="url(#pl-glow)" opacity=".3"/>
<circle data-h="nAV" cx="148" cy="136" r="5.5" fill="#ffd27a" filter="url(#pl-glow)" opacity=".3"/>
<circle data-h="sp1" r="5.5" fill="#fff6d6" filter="url(#pl-glow)" opacity="0"/>
<circle data-h="sp2" r="5.5" fill="#fff6d6" filter="url(#pl-glow)" opacity="0"/>
<g font-family="ui-monospace,Menlo,monospace" font-size="11" font-weight="700" fill="#ffd9df" opacity=".85" text-anchor="middle">
<text x="100" y="98">RA</text><text x="202" y="98">LA</text><text x="104" y="200">RV</text><text x="200" y="210">LV</text>
</g>
</svg>`;

function smooth(pts: readonly Pt[]): string {
  const n = pts.length;
  const at = (i: number): Pt => pts[((i % n) + n) % n] as Pt;
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
}

function squeeze(ch: Chamber, s: number): Pt[] {
  return ch.pts.map(([x, y]): Pt => {
    const nx = ch.c[0] + (x - ch.c[0]) * (1 - ch.k * s);
    let ny = ch.c[1] + (y - ch.c[1]) * (1 - ch.k * s);
    if (ch.apex !== undefined) {
      // Taban apekse doğru kısalır (uzunlamasına kasılma)
      const base = Math.max(0, (ch.apex[1] - y) / 140);
      ny += (ch.apex[1] - y) * 0.07 * s * base;
    }
    return [nx, ny];
  });
}

const bump = (x: number, w: number): number => (x > 0 && x < w ? Math.sin((Math.PI * x) / w) : 0);
const mix = (t: number): string => `rgb(${MYO.map((v, i) => Math.round(v + ((ACT[i] ?? v) - v) * t)).join(",")})`;

/** Ventrikül sistolü (0–1): R + 30 ms'de başlar, RR kısaldıkça hızlanır. */
function ventricularSystole(sinceR: number, rr: number): number {
  const up = Math.min(0.22, rr * 0.3);
  const down = Math.min(0.2, rr * 0.28);
  if (sinceR < 0.03) return 0;
  if (sinceR < 0.03 + up) return Math.sin((Math.PI / 2) * ((sinceR - 0.03) / up));
  if (sinceR < 0.03 + up + down) return Math.cos((Math.PI / 2) * ((sinceR - 0.03 - up) / down));
  return 0;
}

interface PulseHeartFrame {
  /** Kalbin altında gösterilen evre etiketi. */
  readonly label: string;
}

export class PulseHeartAnimator {
  private readonly el: Readonly<Record<string, SVGGraphicsElement>>;

  constructor(root: ParentNode) {
    const map: Record<string, SVGGraphicsElement> = {};
    root.querySelectorAll<SVGGraphicsElement>("[data-h]").forEach((node) => {
      map[node.dataset.h ?? ""] = node;
    });
    this.el = map;
  }

  private set(name: string, attr: string, value: string): void {
    this.el[name]?.setAttribute(attr, value);
  }

  private place(name: string, path: string, f: number | null): void {
    const spark = this.el[name];
    const route = this.el[path] as SVGPathElement | undefined;
    if (spark === undefined) return;
    if (f === null || route === undefined || typeof route.getTotalLength !== "function") {
      spark.setAttribute("opacity", "0");
      return;
    }
    const p = route.getPointAtLength(route.getTotalLength() * Math.max(0, Math.min(1, f)));
    spark.setAttribute("cx", String(p.x));
    spark.setAttribute("cy", String(p.y));
    spark.setAttribute("opacity", "1");
  }

  /**
   * `t`: kayıttaki zaman (s, 0–10 arası döngü). `r`: R tepeleri (s).
   * `rrMedian`: ortanca RR; kayıtta atım yoksa (VF) null.
   */
  render(t: number, r: readonly number[], rrMedian: number | null, profile: PulseHeartProfile): PulseHeartFrame {
    const tt = ((t % 10) + 10) % 10;
    let last = -9;
    let next = 99;
    for (const x of r) {
      if (x <= tt) last = x;
      else {
        next = x;
        break;
      }
    }
    const rr = rrMedian ?? 0.8;
    const sinceR = tt - last;
    const toR = next - tt;
    const chaos = profile.vent === "chaos";
    const focus = profile.vent === "focus";
    // Dal bloğunda geciken taraf ~40 ms sonra uyarılır ve kasılır
    const lagR = profile.bundle === "R" ? 0.04 : 0;
    const lagL = profile.bundle === "L" ? 0.04 : 0;
    const qrsWindow = (lag: number): boolean => sinceR - lag >= -0.04 && sinceR - lag < 0.06;
    const vActAt = (lag: number): number => (qrsWindow(lag) ? Math.max(0, 1 - Math.abs(sinceR - lag - 0.01) / 0.06) : 0);

    let vSR = chaos ? 0 : ventricularSystole(sinceR - lagR, rr);
    let vSL = chaos ? 0 : ventricularSystole(sinceR - lagL, rr);
    let vActR = chaos ? 0 : vActAt(lagR);
    let vActL = chaos ? 0 : vActAt(lagL);
    if (chaos) {
      // Organize kasılma yok: düzensiz titreşim
      const q = 0.1 + 0.07 * Math.sin(t * 41) * Math.sin(t * 17 + 1);
      vSR = vSL = Math.max(0, q);
      vActR = vActL = 0.25 + 0.25 * Math.abs(Math.sin(t * 29) * Math.cos(t * 11));
    }

    // Atriyal olaylar
    let aS = 0, aAct = 0, saOn = 0, avOn = 0;
    let atrSpark: number | null = null;
    let retroSpark: number | null = null;
    let blockedP = false;
    const pWin = profile.pr + 0.04; // P başlangıcından R'ye
    const atrialBeat = (ph: number): void => {
      atrSpark = ph < 0.08 ? ph / 0.08 : null;
      aAct = Math.max(aAct, bump(ph, 0.1));
      aS = Math.max(aS, bump(ph - 0.05, 0.12));
      saOn = Math.max(saOn, bump(ph, 0.07));
    };
    switch (profile.atrial) {
      case "sinus": {
        const ph = pWin - toR;
        if (ph >= 0 && ph < pWin) {
          atrialBeat(ph);
          if (ph > 0.07) avOn = 1;
        }
        if (profile.dropped === true && next < 99 && last > -9 && next - last > rr * 1.45) {
          // Uzun RR içinde iletilmeyen P: atriyum kasılır, AV'de durur
          const pBlocked = (last + next) / 2 - 0.05;
          const phB = tt - pBlocked;
          if (phB >= 0 && phB < 0.3) {
            atrialBeat(phB);
            if (phB > 0.07) avOn = Math.max(avOn, 0.6 * bump(phB - 0.07, 0.2));
            blockedP = true;
          }
        }
        break;
      }
      case "retro": {
        const ph = sinceR - 0.01;
        if (ph >= 0 && ph < 0.14) {
          retroSpark = ph < 0.08 ? 1 - ph / 0.08 : null;
          aAct = bump(ph, 0.1);
          aS = bump(ph - 0.04, 0.12);
        }
        avOn = qrsWindow(0) ? 1 : 0.25;
        break;
      }
      case "flutter": {
        const ph = tt % 0.2;
        aAct = 0.5 + 0.5 * bump(ph, 0.12);
        aS = 0.35 * bump(ph - 0.02, 0.14);
        avOn = toR < 0.12 ? 1 : 0.3;
        break;
      }
      case "fib": {
        aS = 0.16 + 0.1 * Math.sin(t * 47) * Math.sin(t * 13);
        aAct = 0.35 + 0.3 * Math.abs(Math.sin(t * 31) * Math.cos(t * 17));
        avOn = toR < 0.08 ? 1 : 0.2;
        break;
      }
      case "independent": {
        const ph = tt % 0.68;
        atrialBeat(ph);
        avOn = 0.12;
        break;
      }
      case "none":
        avOn = 0.1;
        break;
    }

    // Boşluklar
    const lv = profile.lv ?? 1;
    const draw = (key: "RA" | "LA" | "RV" | "LV", s: number, act: number): void => {
      const ch = CHAMBERS[key];
      const atrium = key === "RA" || key === "LA";
      this.set(key, "d", smooth(squeeze(ch, s)));
      this.set(key, "stroke-width", (ch.w * (1 + (atrium ? 0.25 : 0.45) * s)).toFixed(1));
      this.set(key, "stroke", mix(Math.max(0, Math.min(1, act)) * 0.85));
    };
    draw("RA", aS, aAct);
    draw("LA", aS, aAct);
    draw("RV", vSR, vActR);
    draw("LV", vSL * lv, vActL);
    const vMean = (vSR + vSL * lv) / 2;
    this.set("peric", "d", smooth(HULL.map(([x, y]): Pt => {
      const lower = y > 140;
      const k = 1 - 0.04 * (lower ? vMean : aS);
      return [150 + (x - 150) * k, 170 + (y - 170) * (lower ? 1 - 0.05 * vMean : 1)];
    })));

    // Kapaklar: diyastolde açık, sistolde kapalı
    const open = 1 - Math.min(1, vMean * 1.6);
    const valve = (x0: number, x1: number, y: number): string => {
      const m = (x0 + x1) / 2, dy = 18 * open, dx = 6 * open;
      return `M${x0} ${y} L${(m - dx).toFixed(1)} ${(y + dy).toFixed(1)} M${x1} ${y} L${(m + dx).toFixed(1)} ${(y + dy).toFixed(1)}`;
    };
    this.set("vTri", "d", valve(70, 136, 140));
    this.set("vMit", "d", valve(164, 236, 140));

    // İleti sistemi
    this.set("nSA", "opacity", String(0.3 + 0.7 * saOn));
    this.set("nAV", "opacity", String(0.3 + 0.7 * avOn));
    this.set("pAtr", "opacity", String(0.3 + 0.6 * aAct));
    const conducting = !focus && !chaos;
    this.set("pHis", "opacity", String(conducting && qrsWindow(0) ? 0.95 : 0.25));
    this.set("pRBB", "opacity", String(conducting && profile.bundle !== "R" && qrsWindow(0) ? 0.95 : profile.bundle === "R" ? 0.12 : 0.25));
    this.set("pLBB", "opacity", String(conducting && profile.bundle !== "L" && qrsWindow(0) ? 0.95 : profile.bundle === "L" ? 0.12 : 0.25));
    const accOn = profile.accessory === true;
    const accPh = pWin - toR;
    this.set("pAcc", "opacity", accOn ? String(accPh > 0.04 && accPh < pWin ? 0.95 : 0.4) : "0");

    // Kıvılcımlar
    const f = (sinceR + 0.04) / 0.1;
    if (atrSpark !== null) this.place("sp1", "pAtr", atrSpark);
    else if (retroSpark !== null) this.place("sp1", "pAtr", retroSpark);
    else if (focus && sinceR >= -0.04 && sinceR < 0.1) this.place("sp1", "pLBB", 1 - (sinceR + 0.04) / 0.14);
    else if (conducting && qrsWindow(0)) {
      if (f < 0.35) this.place("sp1", "pHis", f / 0.35);
      else if (profile.bundle === "R") this.place("sp1", "pRBB", null);
      else this.place("sp1", "pRBB", (f - 0.35) / 0.65);
    } else this.place("sp1", "pAtr", null);
    if (accOn && accPh > 0.04 && accPh < 0.12) this.place("sp2", "pAcc", (accPh - 0.04) / 0.08);
    else if (focus && sinceR >= -0.04 && sinceR < 0.1) this.place("sp2", "pRBB", 1 - (sinceR + 0.04) / 0.14);
    else if (conducting && qrsWindow(0) && f >= 0.35 && profile.bundle !== "L") this.place("sp2", "pLBB", (f - 0.35) / 0.65);
    else this.place("sp2", "pLBB", null);

    return { label: this.label(profile, { vS: vMean, aS, qrs: qrsWindow(0), blockedP }) };
  }

  private label(p: PulseHeartProfile, s: { vS: number; aS: number; qrs: boolean; blockedP: boolean }): string {
    if (p.vent === "chaos") return "Ventriküller titriyor · organize kasılma yok";
    if (p.vent === "focus") return "Ventrikül odağı · His–Purkinje dışı yayılım";
    if (p.atrial === "fib") return "Atriyum titriyor · AV düğüm düzensiz geçiriyor";
    if (p.atrial === "flutter") return "Atriyal flutter devresi · AV düğüm oranla geçiriyor";
    if (p.atrial === "independent") return "Atriyum ve ventrikül bağımsız";
    if (s.blockedP) return "P iletilmedi · AV blok";
    if (s.qrs) return p.bundle === "R" ? "QRS · sağ dal gecikmeli" : p.bundle === "L" ? "QRS · sol dal gecikmeli" : "QRS · His–Purkinje";
    if (s.vS > 0.05) return "Ventrikül sistolü";
    if (s.aS > 0.05) return p.atrial === "retro" ? "Atriyum geriye doğru uyarıldı" : "Atriyal sistol";
    return "Diyastol";
  }
}
