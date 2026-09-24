import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { resolveLibrarySoundEx } from "../core/resolver";
import { useStore } from "../core/StoreProvider";
import { tutorialProgress, type TutorialEvent } from "../core/flow";
import type { AuscultationPoint, SoundRecord } from "../core/types";
import pointsData from "../data/auscultation-points.json";
import libraryData from "../data/library.json";
import type { StageAudio } from "../ui/PatientStage";
import { PatientStage, type StageHandle } from "../ui/PatientStage";
import { Toolbar, type ToolbarAudio } from "../ui/Toolbar";
import { EcgDeco, Footer, touchTarget } from "../ui/chrome";
import { IconArrowRight, IconCheck } from "../ui/icons";

const STEP_TEXT = [
  { title: "Stetoskobu sürükleyin", desc: "Sağdaki hasta üzerinde stetoskopu tıklayıp sürüklemeye başlayın." },
  { title: "Bir odağa bırakın", desc: "İşaretli oskültasyon noktalarından birinin üzerine bırakın — ses otomatik çalar." },
  { title: "Bell veya Diyaframı değiştirin", desc: "Alt araç çubuğundan stetoskop kafasını değiştirin." },
] as const;

const points = pointsData.points as AuscultationPoint[];
const heartNormal = (libraryData.groups as { items: { key: string; bestPoints: string[] }[] }[])
  .flatMap((group) => group.items)
  .find((item) => item.key === "heart.normal");
const tutorialFilterIds = heartNormal?.bestPoints;
const HIT = touchTarget();

export type TutorialAudio = StageAudio & ToolbarAudio;

export function createNoopTutorialAudio(): TutorialAudio {
  return {
    play: async () => undefined,
    replay: async () => undefined,
    stop: () => undefined,
    setVolume: () => undefined,
    setMuted: () => undefined,
    getActive: () => null,
    ensureContext: async () => undefined,
  };
}

export interface TutorialScreenProps {
  readonly embedded?: boolean;
  readonly audio?: TutorialAudio;
}

/** İlk kullanım öğreticisi: PatientStage üzerinde üç rehberli adım. */
export function TutorialScreen({
  embedded = false,
  audio = createNoopTutorialAudio(),
}: TutorialScreenProps): JSX.Element {
  const { state, dispatch } = useStore();
  const [dontShow, setDontShow] = useState(false);
  const [events, setEvents] = useState<TutorialEvent[]>([]);
  const stageRef = useRef<StageHandle>(null);
  const initialHead = useRef(state.head);
  const progress = useMemo(() => tutorialProgress(events), [events]);

  useEffect(() => {
    if (state.head === initialHead.current) return;
    setEvents((prev) => (prev.includes("head") ? prev : [...prev, "head"]));
  }, [state.head]);

  const soundFor = (pointId: string): SoundRecord | null =>
    resolveLibrarySoundEx("heart", "normal", pointId).record;

  const finish = () => {
    if (dontShow) dispatch({ type: "tutorialDone", done: true });
    dispatch({ type: "tutorialSeen" });
    dispatch({ type: "goto", screen: "modes" });
  };

  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: "relative", zIndex: 1 }}>
        <div className="container screen-body">
          <div className="tutorial-wrap">
            <div className="tut-text-col">
              <h1 className="tut-title">Nasıl Kullanılır?</h1>
              <p className="tut-lead">Aşağıdaki 3 adımı sağdaki hasta üzerinde bizzat deneyerek geçin.</p>
              <p className="tut-sub">Her adımı tamamladığınızda işaretlenir — sırayla yapmak zorunlu değildir.</p>
              <div className="tut-steps tut-steps-live">
                {STEP_TEXT.map((step, i) => (
                  <div
                    className={`tut-step ${progress.steps[i] ? "done" : ""} ${!progress.steps[i] && progress.currentStep === i ? "active" : ""}`}
                    key={step.title}
                  >
                    <span className="num">{progress.steps[i] ? <IconCheck width={14} height={14} /> : i + 1}</span>
                    <div>
                      <h5>{step.title}</h5>
                      <p>{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              {progress.allDone && (
                <div className="tut-celebrate" role="status">
                  <strong>Harika, hazırsınız!</strong> Artık simülatörü kullanmayı biliyorsunuz.
                </div>
              )}
              <div className="tut-footer">
                <label className="tut-again" style={HIT}>
                  <input
                    type="checkbox"
                    checked={dontShow}
                    onChange={(e) => setDontShow(Boolean((e.target as { checked?: boolean }).checked))}
                  />
                  Tekrar gösterme
                </label>
                {progress.allDone ? (
                  <button className="btn primary" style={HIT} onClick={finish}>
                    Modlara geç <IconArrowRight />
                  </button>
                ) : (
                  <button className="hero-link tut-skip" style={HIT} onClick={finish}>
                    Atla
                  </button>
                )}
              </div>
            </div>
            <div className={`stage-card tut-stage-col ${progress.currentStep < 2 ? "tut-highlight" : ""}`}>
              <PatientStage
                ref={stageRef}
                points={points}
                {...(tutorialFilterIds ? { filterIds: tutorialFilterIds } : {})}
                view="front"
                head={state.head}
                volume={state.volume}
                showPoints
                showLabels
                bodyType="erkek"
                mode="learn"
                engine={audio}
                soundFor={soundFor}
                onVisit={() => setEvents((prev) => (prev.includes("snap") ? prev : [...prev, "snap"]))}
                onDwell={() => undefined}
                onListen={() => undefined}
                onPlayingChange={() => undefined}
                onDragStart={() => setEvents((prev) => (prev.includes("drag") ? prev : [...prev, "drag"]))}
              />
              <div className={progress.currentStep === 2 && !progress.allDone ? "tut-highlight" : ""}>
                <Toolbar stageRef={stageRef} activePoint={null} engine={audio} />
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  );
}
