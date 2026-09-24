import type { JSX } from "react";
import { useStore } from "../core/StoreProvider";
import { computeMetrics } from "../data/metrics";
import sourcesData from "../data/sources.json";
import { Footer, touchTarget } from "../ui/chrome";
import { ScreenHeading } from "../ui/ScreenHeading";
import { IconArrowRight, IconHeadphones, IconInfo } from "../ui/icons";
import { playVolumeCheckTone, type VolumeCheckAudio } from "./tone";

const M = computeMetrics();
const VAL_SHORT =
  (sourcesData as { module?: { validation?: { short?: string } } }).module?.validation?.short ?? "";
const HIT = touchTarget();

export interface StartScreenProps {
  /** Platform kabuğu: footer çizilmez, SCORM ifadesi kalkar. */
  readonly embedded?: boolean;
  /** Ses düzeyi kontrolü. Verilmezse düğme çizilir, ton çalmaz. */
  readonly audio?: VolumeCheckAudio;
}

/** Başlangıç ekranı: marka, envanter güven kutuları, kulaklık önerisi. */
export function StartScreen({ embedded = false, audio }: StartScreenProps): JSX.Element {
  const { dispatch, bus } = useStore();

  const playTone = () => {
    if (!audio) return;
    void audio.ensureContext().then(playVolumeCheckTone).catch(() => undefined);
  };

  const begin = () => {
    if (audio) void audio.ensureContext().catch(() => undefined);
    bus.emit({ type: "simulation_started" });
    dispatch({ type: "goto", screen: "modes" });
  };

  const whyBoxes: { label: string; desc: string }[] = [
    { label: `${M.datasets} veri seti`, desc: `HLS-CMDS v3 + CirCor — lisansı doğrulanmış klinik kaynaklar; ${VAL_SHORT}` },
    { label: `${M.bundledRecordings} klinik kayıt`, desc: "Pakete dahil, gerçek hasta/manikin oskültasyon kaydı." },
    {
      label: `${M.totalCases} vaka · ${M.assessmentQuestions} soru`,
      desc: `Her oturumda rastgele 10 vaka; ${M.pediatricCases} pediatrik vaka dahil.`,
    },
  ];

  return (
    <div className="screen start-hero-screen">
      <div className="hero-glow" aria-hidden="true" />
      <div className="start-hero">
        <div className="hero-inst-top">
          <img
            src="brand/ege-tip-logo.png"
            alt="Ege Üniversitesi Tıp Fakültesi amblemi"
            onError={(e) => {
              const target = e.currentTarget as { style?: { display: string } };
              if (target.style) target.style.display = "none";
            }}
          />
          <span>Ege Üniversitesi Tıp Fakültesi</span>
        </div>
        <img
          className="hero-logo"
          src="brand/logo-horizontal-web.png"
          alt="EGEMED Ausculta — Kardiyopulmoner Oskültasyon Simülatörü"
        />
        <ScreenHeading className="hero-title">Gerçek kayıtlarla kalp ve akciğer sesini keşfedin.</ScreenHeading>
        <p className="hero-sub">
          {M.soundClasses} ses sınıfı, yetişkin ve pediatrik gövde üzerinde sistematik oskültasyon;{" "}
          {embedded ? "ölçme ve değerlendirme" : "SCORM uyumlu ölçme ve değerlendirme"}.
        </p>
        <button className="hero-cta" style={HIT} onClick={begin}>
          Simülatörü başlat <IconArrowRight />
        </button>
        <div className="hero-links">
          <button className="hero-link" style={HIT} onClick={() => dispatch({ type: "goto", screen: "tutorial" })}>
            Nasıl kullanılır?
          </button>
          <span className="hero-link-sep" aria-hidden="true" />
          <button className="hero-link" style={HIT} onClick={() => dispatch({ type: "goto", screen: "sources" })}>
            <IconInfo /> Hakkında ve kaynaklar
          </button>
        </div>
        <div className="why-section" aria-label="Neden güvenilir?">
          <p className="why-title">Neden güvenilir?</p>
          <div className="why-grid">
            {whyBoxes.map((w) => (
              <div className="why-box" key={w.label}>
                <b>{w.label}</b>
                <span>{w.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <button className="hero-audio-hint" style={HIT} onClick={playTone}>
          <IconHeadphones />
          Oskültasyon seslerini doğru değerlendirebilmek için kulaklık kullanmanız önerilir.
          <span className="hero-audio-check">Ses düzeyi kontrol</span>
        </button>
      </div>
      <Footer embedded={embedded} />
    </div>
  );
}
