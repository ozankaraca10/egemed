import { useEffect, useState, type JSX } from "react";
import { icons } from "@egemed/ui";
import { t } from "@egemed/ui/i18n";
import { shellNow } from "../now";
import {
  AI_GUARD_CLEAR,
  aiGuardSecondsLeft,
  aiGuardStep,
  browserAiGuardEnvironment,
  detectAiAgents,
  isCompetitiveHash,
  type AiGuardEnvironment,
  type AiGuardState,
} from "./aiGuard";

/** Ajan işaretleri sayfaya sonradan eklenebilir; yoklama aralığı. */
const POLL_MS = 1_000;

/** Tespit döngüsü; yalnız rekabetçi adreste (bkz. `isCompetitiveHash`) sinyal sayılır. */
export function useAiGuard(active: boolean, environment: AiGuardEnvironment | null = browserAiGuardEnvironment()): { readonly state: AiGuardState; readonly now: number } {
  const [snapshot, setSnapshot] = useState<{ readonly state: AiGuardState; readonly now: number }>({ state: AI_GUARD_CLEAR, now: 0 });
  useEffect(() => {
    if (!active || environment === null) {
      setSnapshot({ state: AI_GUARD_CLEAR, now: 0 });
      return undefined;
    }
    const tick = () =>
      setSnapshot((previous) => {
        const now = shellNow();
        const signals = isCompetitiveHash(environment.hash()) ? detectAiAgents(environment) : [];
        return { state: aiGuardStep(previous.state, signals, now), now };
      });
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
    // Ortam tarayıcıda sabittir; yalnız etkinlik değişince yeniden kurulur.
  }, [active]);
  return snapshot;
}

/** Sim sahnesinin üstünde kaplama: uyarıda geri sayım, engelde duraklatma. */
export function AiGuardOverlay({ state, now }: { readonly state: AiGuardState; readonly now: number }): JSX.Element | null {
  if (state.kind === "clear") return null;
  const blocked = state.kind === "blocked";
  const seconds = aiGuardSecondsLeft(state, now);
  return (
    <div aria-describedby="eg-ai-guard-body" aria-labelledby="eg-ai-guard-title" aria-modal="true" className="eg-shell-aiguard" role="alertdialog">
      <div className="eg-shell-aiguard__card">
        <span aria-hidden="true" className="eg-shell-aiguard__icon"><icons.ShieldCheck /></span>
        <h2 className="eg-shell-aiguard__title" id="eg-ai-guard-title">
          {t(blocked ? "integrity.aiGuard.blockedTitle" : "integrity.aiGuard.title")}
        </h2>
        <p className="eg-shell-aiguard__body" id="eg-ai-guard-body">
          {t(blocked ? "integrity.aiGuard.blockedBody" : "integrity.aiGuard.body")}
        </p>
        <ul className="eg-shell-aiguard__signals">
          {state.signals.map((signal) => <li key={signal}>{t(`integrity.aiGuard.signal.${signal}`)}</li>)}
        </ul>
        {blocked ? null : (
          <p aria-live="polite" className="eg-shell-aiguard__countdown">
            {t("integrity.aiGuard.countdown").replace("{s}", String(seconds))}
          </p>
        )}
        <p className="eg-shell-aiguard__privacy">{t("integrity.aiGuard.privacy")}</p>
      </div>
    </div>
  );
}
