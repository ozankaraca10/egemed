/** Alt araç çubuğu: Bell/Diyafram, Ön/Arka, ses, tekrar dinle, ipucu.
 *  Ses motoru prop veya bağlam ile gelir; modül singleton'ı yoktur.
 *  "Soruya git" kaydırması `ToolbarEnv` üzerinden geçer. Zaman damgasını veri yolu vurur. */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { CaseDef, PatientView, Question, StethHead } from "../core/types";
import type { SimEventDraft } from "../core/events";
import type { Action } from "../core/reducer";
import { useStore } from "../core/StoreProvider";
import { IconBell, IconBodyBack, IconBodyFront, IconDiaphragm, IconLightbulb, IconVolume } from "./glyphs";

const HIT = { minWidth: 44, minHeight: 44 } as const;

export interface ToolbarAudio {
  setVolume(volume: number): void;
}

export interface ToolbarScrollTarget {
  scrollIntoView(options: { behavior: "smooth"; block: "start" }): void;
}

/** Belge sınırı. Üretimde kabuk `document.querySelector` vekilini enjekte eder. */
export interface ToolbarEnv {
  query(selector: string): ToolbarScrollTarget | null;
}

export function createNoopToolbarEnv(): ToolbarEnv {
  return { query: () => null };
}

export const QUESTION_JUMP_SELECTOR = ".sim-side .q-card-dark, .sim-side .case-end-card";

const NOOP_ENV: ToolbarEnv = createNoopToolbarEnv();
const ToolbarAudioContext = createContext<ToolbarAudio | null>(null);

export function ToolbarAudioProvider({ engine, children }: { engine: ToolbarAudio; children: ReactNode }) {
  return <ToolbarAudioContext.Provider value={engine}>{children}</ToolbarAudioContext.Provider>;
}

export interface ToolbarStageRef {
  current: { replay(): void } | null;
}

export interface ToolbarPorts {
  dispatch: (action: Action) => void;
  emit: (event: SimEventDraft) => void;
  engine: ToolbarAudio;
  env: ToolbarEnv;
  stage: ToolbarStageRef;
  openHint: () => void;
  onHint?: (() => void) | undefined;
}

export type ToolbarIntent =
  | { kind: "head"; head: StethHead }
  | { kind: "view"; view: PatientView }
  | { kind: "volume"; volume: number }
  | { kind: "replay"; activePoint: string | null }
  | { kind: "jump" }
  | { kind: "hint" };

/** Kaynak tıklama etkileri. `Date.now()` ve `document` burada yoktur. */
export function performToolbar(ports: ToolbarPorts, intent: ToolbarIntent): void {
  switch (intent.kind) {
    case "head":
      ports.dispatch({ type: "setHead", head: intent.head });
      return;
    case "view":
      ports.dispatch({ type: "setView", view: intent.view });
      ports.emit({ type: "view_changed", view: intent.view });
      return;
    case "volume":
      ports.dispatch({ type: "setVolume", volume: intent.volume });
      ports.engine.setVolume(intent.volume);
      return;
    case "replay":
      ports.dispatch({ type: "replay" });
      ports.stage.current?.replay();
      if (intent.activePoint) ports.emit({ type: "sound_replayed", pointId: intent.activePoint });
      return;
    case "jump":
      ports.env.query(QUESTION_JUMP_SELECTOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    case "hint":
      ports.onHint?.();
      ports.openHint();
      return;
  }
}

export function showHintControl(strict: boolean, hint: string | undefined, hintOpen: boolean, hintsUsed: number): boolean {
  return !strict && Boolean(hint) && !hintOpen && hintsUsed === 0;
}

export interface ToolbarProps {
  caseDef?: CaseDef;
  stageRef: ToolbarStageRef;
  activePoint: string | null;
  question?: Question;
  onHint?: () => void;
  /** Değerlendirme: ipucu ve tekrar dinleme kapalı. */
  strict?: boolean;
  engine?: ToolbarAudio;
  env?: ToolbarEnv;
  /** Statik render tohumu; tıklama sonrası yerel durum devralır. */
  initialHintOpen?: boolean;
}

function rangeVolume(target: unknown): number {
  if (!target || typeof target !== "object" || !("value" in target)) return 0;
  return Number((target as { value: string }).value) / 100;
}

function SelectedMark({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span className="tool-mark" aria-hidden="true">
      ✓
    </span>
  );
}

export function Toolbar({
  caseDef,
  stageRef,
  activePoint,
  question,
  onHint,
  strict = false,
  engine: engineProp,
  env = NOOP_ENV,
  initialHintOpen = false,
}: ToolbarProps) {
  const { state, dispatch, bus } = useStore();
  const contextual = useContext(ToolbarAudioContext);
  const engine = engineProp ?? contextual;
  if (!engine) throw new Error("Ausculta ses motoru yok");

  const heads = caseDef?.allowedHeads ?? (["bell", "diaphragm"] as const);
  const [hintOpen, setHintOpen] = useState(initialHintOpen);
  const showHint = showHintControl(strict, question?.hint, hintOpen, state.hintsUsed);
  const ports: ToolbarPorts = {
    dispatch,
    emit: (event) => bus.emit(event),
    engine,
    env,
    stage: stageRef,
    openHint: () => setHintOpen(true),
    onHint,
  };
  const percent = Math.round(state.volume * 100);

  return (
    <>
      {hintOpen && question?.hint && (
        <div className="hint-box" role="note">
          <IconLightbulb />
          <span>
            {question.hint}
            <span className="muted small"> (İpucu kullanıldı — puanı -5)</span>
          </span>
        </div>
      )}
      <div className="toolbar" role="toolbar" aria-label="Oskültasyon araçları">
        <div className="head-toggle" role="group" aria-label="Stetoskop kafası seçimi">
          {heads.map((h) => {
            const selected = state.head === h;
            return (
              <button
                key={h}
                type="button"
                className={selected ? "active" : ""}
                style={HIT}
                onClick={() => performToolbar(ports, { kind: "head", head: h })}
                aria-pressed={selected}
                title={h === "bell" ? "Bell — düşük frekans vurgusu" : "Diyafram — orta/yüksek frekans vurgusu"}
              >
                {h === "bell" ? <IconBell /> : <IconDiaphragm />}
                {h === "bell" ? "Bell" : "Diyafram"}
                <SelectedMark on={selected} />
              </button>
            );
          })}
        </div>
        <div className="tool-sep" />
        <div className="view-toggle" role="group" aria-label="Gövde görünümü">
          <button
            type="button"
            className={state.view === "front" ? "active" : ""}
            style={HIT}
            aria-pressed={state.view === "front"}
            onClick={() => performToolbar(ports, { kind: "view", view: "front" })}
          >
            <IconBodyFront /> Ön
            <SelectedMark on={state.view === "front"} />
          </button>
          <button
            type="button"
            className={state.view === "back" ? "active" : ""}
            style={HIT}
            aria-pressed={state.view === "back"}
            onClick={() => performToolbar(ports, { kind: "view", view: "back" })}
          >
            <IconBodyBack /> Arka
            <SelectedMark on={state.view === "back"} />
          </button>
        </div>
        <div className="tool-sep" />
        <div className="vol-group">
          <input
            type="range"
            min={0}
            max={100}
            value={percent}
            aria-label="Ses düzeyi"
            style={{ minHeight: 44 }}
            onChange={(event) => {
              performToolbar(ports, { kind: "volume", volume: rangeVolume(event.target) });
            }}
          />
          <span className="pct">%{percent}</span>
        </div>
        {!strict && (
          <>
            <div className="tool-sep" />
            <button
              type="button"
              className="btn outline small"
              style={HIT}
              onClick={() => performToolbar(ports, { kind: "replay", activePoint })}
              disabled={!activePoint}
            >
              <IconVolume /> Tekrar Dinle
            </button>
          </>
        )}
        {caseDef && (
          <button type="button" className="btn outline small jump-to-q" style={HIT} onClick={() => performToolbar(ports, { kind: "jump" })}>
            Soruya git ↓
          </button>
        )}
        <div className="spacer" style={{ flex: 1 }} />
        {showHint && (
          <button
            type="button"
            className="btn outline small"
            style={HIT}
            title="İpucu kullanımı -5 puan"
            onClick={() => performToolbar(ports, { kind: "hint" })}
          >
            <IconLightbulb /> İpucu
          </button>
        )}
      </div>
    </>
  );
}
