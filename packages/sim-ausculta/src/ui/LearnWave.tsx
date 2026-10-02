import type { JSX, ReactNode } from "react";
import type { WaveView } from "../data/learnSets";

/** T307 — öğrenme modu dalga paneli: çalan kaydın zarfı ve kaynağın uzman
 *  işaretleri (CirCor S1/S2, SPRSound olayları, ICBHI döngüleri). SVG; tuval,
 *  RAF ve zaman okuması yoktur (sunucuda da çizilir).
 *  T310: çalarken dikey konum çubuğu CSS animasyonuyla kaydın gerçek süresinde soldan
 *  sağa ilerler; motor kaydı döngüyle çaldığı için animasyon da döner. Çalma her
 *  başladığında üst bileşen `playhead.token`'ı artırır, çubuk yeniden kurulur ve
 *  animasyon sıfırdan (sesle birlikte) başlar. */

const MARK_CLASS: Record<string, string> = {
  S1: "s1",
  S2: "s2",
  Stridor: "stridor",
  Wheeze: "wheeze",
  Ral: "crackle",
  "Kaba ral": "crackle",
  "Wheeze+ral": "both",
  Ronküs: "rhonchi",
};

const MARK_LABEL: Record<string, string> = {
  S1: "S1",
  S2: "S2",
  Stridor: "Stridor",
  Wheeze: "Wheezing",
  Ral: "Ral",
  "Kaba ral": "Kaba ral",
  "Wheeze+ral": "Wheezing + ral",
  Ronküs: "Ronküs",
};

export interface LearnWaveProps {
  readonly title: string;
  readonly meta: string;
  readonly wave: WaveView | null;
  readonly markSource: string | null;
  readonly emptyText: string;
  /** T309: oynatıcı denetimleri (dinle/durdur, göğüs başlığı). */
  readonly controls?: ReactNode;
  /** T310: çalarken konum çubuğu — kaydın döngü süresi (sn) ve çalma başlangıcı jetonu. */
  readonly playhead?: { readonly periodSec: number; readonly token: number } | null;
}

export function LearnWave({ title, meta, wave, markSource, emptyText, controls, playhead }: LearnWaveProps): JSX.Element {
  const W = 600;
  const H = 190;
  const mid = H / 2 - 8;
  const types = wave ? [...new Set(wave.marks.map((mark) => mark.k))] : [];
  return (
    <section className="lw" aria-label="Kayıt dalga formu">
      <div className="lw-top">
        <b>{title}</b>
        <span className="lw-meta">{meta}</span>
      </div>
      {wave ? (
        <div className="lw-plot">
        <svg className="lw-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${title} dalga formu`}>
          <rect x={0} y={0} width={W} height={H} className="lw-bg" />
          {wave.marks.map((mark, index) => {
            const x = (mark.t / wave.durationSec) * W;
            const w = Math.max(2, ((mark.e - mark.t) / wave.durationSec) * W);
            return <rect key={index} x={x} y={0} width={w} height={H} className={`lw-mark ${MARK_CLASS[mark.k] ?? "other"}`} />;
          })}
          {Array.from({ length: Math.floor(wave.durationSec) + 1 }, (_, s) => (
            <g key={s}>
              <line x1={(s / wave.durationSec) * W} x2={(s / wave.durationSec) * W} y1={0} y2={H} className="lw-grid" />
              <text x={(s / wave.durationSec) * W + 3} y={H - 4} className="lw-tick">
                {s} s
              </text>
            </g>
          ))}
          <path
            className="lw-env"
            d={wave.env
              .map((value, index) => {
                const x = (index / wave.env.length) * W;
                const h = value * (H * 0.42);
                return `M${x.toFixed(1)} ${(mid - h).toFixed(1)}V${(mid + h).toFixed(1)}`;
              })
              .join("")}
          />
        </svg>
          {playhead && playhead.periodSec > 0 ? (
            <Playhead key={playhead.token} windowSec={wave.durationSec} periodSec={playhead.periodSec} />
          ) : null}
        </div>
      ) : (
        <p className="lw-empty">{emptyText}</p>
      )}
      <div className="lw-legend">
        {types.map((type) => (
          <span key={type}>
            <i className={`lw-dot ${MARK_CLASS[type] ?? "other"}`} aria-hidden="true" />
            {MARK_LABEL[type] ?? type}
          </span>
        ))}
        {wave && types.length > 0 && markSource ? <span>Etiketler: {markSource}</span> : null}
        {wave && types.length === 0 ? <span>Bu kayıtta olay zamanı etiketi yok; dalga formu kaydın kendisi.</span> : null}
      </div>
      {controls ? <div className="lw-ctrls">{controls}</div> : null}
    </section>
  );
}

/** Konum çubuğu: iz, kaydın tamamını temsil edecek kadar geniştir (pencere / süre
 *  oranında); gösterilen pencere (`windowSec`) kaydın tamamından (`periodSec`) kısaysa
 *  çubuk pencereyi geçince kırpılır ve döngü başında yeniden görünür. */
function Playhead({ windowSec, periodSec }: { windowSec: number; periodSec: number }): JSX.Element {
  const frac = Math.min(1, windowSec / periodSec);
  return (
    <span className="lw-track" style={{ width: `${(100 / frac).toFixed(3)}%` }} aria-hidden="true">
      <i className="lw-head" style={{ animationDuration: `${periodSec}s` }} />
    </span>
  );
}
