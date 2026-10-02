/** Alt araç çubuğu: Bell/Diyafram, Ön/Arka, ses, tekrar dinle, ipucu.
 *  Ses motoru prop veya bağlam ile gelir; modül singleton'ı yoktur.
 *  "Soruya git" kaydırması `ToolbarEnv` üzerinden geçer. Zaman damgasını veri yolu vurur. */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { CaseDef, PatientView, Question, StethHead } from "../core/types";
import type { SimEventDraft } from "../core/events";
import type { Action } from "../core/reducer";
import { useStore } from "../core/StoreProvider";
import { IconBell, IconBodyBack, IconBodyFront, IconDiaphragm, IconLightbulb, IconVolume } from "./glyphs";
import { IconLock } from "./icons";

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
  /** T233: izinli gövde görünümleri. Verilmezse `caseDef.views`, o da yoksa iki görünüm
   *  açık kabul edilir; izinli olmayan görünüm düğmesi devre dışı çizilir. */
  allowedViews?: readonly PatientView[];
  /** Statik render tohumu; tıklama sonrası yerel durum devralır. */
  initialHintOpen?: boolean;
}

/** İzinli olmayan görünümün kısa Türkçe açıklaması (renk dışı kilit imiyle birlikte). */
export function viewLockReason(view: PatientView): string {
  return `Bu vakada dinlenecek ${VIEW_LABEL[view].toLocaleLowerCase("tr")} bölge yok`;
}

/** Görünüm adları (depo sahibi, 2 Eki 2026: "ön/arka" yerine anterior/posterior). */
export const VIEW_LABEL: Record<PatientView, string> = {
  front: "Anterior",
  back: "Posterior",
  left: "Sol lateral",
  right: "Sağ lateral",
};

const VIEW_SHORT: Record<PatientView, string> = { front: "Anterior", back: "Posterior", left: "Sol lat.", right: "Sağ lat." };

export interface ViewToggleProps {
  /** Çizilecek görünüm düğmeleri (sıra korunur). */
  readonly views: readonly PatientView[];
  /** İzinli görünümler; diğerleri kilit imi + gerekçeyle devre dışı çizilir. */
  readonly allowed: readonly PatientView[];
  readonly selected: PatientView;
  readonly onSelect: (view: PatientView) => void;
  /** Gövde simgeleri (araç çubuğunda açık; öğrenme sahnesi üstünde yalın). */
  readonly icons?: boolean;
  readonly className?: string;
  /** Kilit gerekçesi; verilmezse vaka metni (`viewLockReason`). */
  readonly lockReason?: (view: PatientView) => string;
}

/** Görünüm düğme grubu: araç çubuğu ve öğrenme sahnesi (T309) ortak kullanır. */
export function ViewToggle({ views, allowed, selected, onSelect, icons = true, className, lockReason = viewLockReason }: ViewToggleProps) {
  return (
    <div className={["view-toggle", className].filter(Boolean).join(" ")} role="group" aria-label="Gövde görünümü">
      {views.map((view) => {
        const isSelected = selected === view;
        const enabled = allowed.includes(view);
        const reason = lockReason(view);
        return (
          <button
            key={view}
            type="button"
            className={isSelected ? "active" : ""}
            style={HIT}
            aria-pressed={isSelected}
            // Devre dışı görünüm klavye sırasına girmez; neden ikon + gizli metinle taşınır.
            disabled={!enabled}
            aria-disabled={!enabled}
            title={enabled ? undefined : reason}
            onClick={() => onSelect(view)}
          >
            {icons ? <>{view === "back" ? <IconBodyBack /> : <IconBodyFront />} </> : null}
            {VIEW_SHORT[view]}
            <SelectedMark on={isSelected} />
            {!enabled && (
              <span className="view-locked" aria-hidden="true">
                <IconLock width={13} height={13} />
              </span>
            )}
            {!enabled && <span className="sr-only"> — {reason}</span>}
          </button>
        );
      })}
    </div>
  );
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
  allowedViews: allowedViewsProp,
  initialHintOpen = false,
}: ToolbarProps) {
  const { state, dispatch, bus } = useStore();
  const contextual = useContext(ToolbarAudioContext);
  const engine = engineProp ?? contextual;
  if (!engine) throw new Error("Ausculta ses motoru yok");

  const heads = caseDef?.allowedHeads ?? (["bell", "diaphragm"] as const);
  const declaredViews = allowedViewsProp ?? caseDef?.views;
  const allowedViews: readonly PatientView[] =
    declaredViews !== undefined && declaredViews.length > 0 ? declaredViews : ["front", "back"];
  const lockedViews = (["front", "back"] as const).filter((view) => !allowedViews.includes(view));
  // Lateral görünümler yalnız izinliyse gösterilir (vakalarda yok; öğrenmede gerçek lateral kayıt).
  const shownViews: PatientView[] = [
    "front",
    "back",
    ...(["left", "right"] as const).filter((view) => allowedViews.includes(view)),
  ];
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
        <ViewToggle
          views={shownViews}
          allowed={allowedViews}
          selected={state.view}
          onSelect={(view) => performToolbar(ports, { kind: "view", view })}
        />
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
      {lockedViews.length > 0 && (
        <p className="view-note">
          <IconLock width={13} height={13} aria-hidden="true" />{" "}
          {lockedViews.map((view) => `${VIEW_LABEL[view]} görünüm kapalı: ${viewLockReason(view).toLocaleLowerCase("tr")}.`).join(" ")}
        </p>
      )}
    </>
  );
}
