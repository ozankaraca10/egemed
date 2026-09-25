import type { JSX } from "react";
import type { SimChrome, SimChromeIcon } from "@egemed/sim-host";
import { t } from "@egemed/ui/i18n";
import { routeHref } from "./routes";

/**
 * Birleşik bar (UX kararı, 25 Eylül 2026): sim rotasında kabuğun üst barı
 * simin barına dönüşür. Konum (Simülatörler › Sim), tek h1, adım göstergesi,
 * bilgi çipleri ve simin eylemleri burada çizilir; simler kendi üst barını
 * çizmez (`SimMountContext.setChrome`).
 */
const ICON_PATHS: Record<SimChromeIcon, readonly string[]> = {
  fullscreen: ["M8 3H5a2 2 0 0 0-2 2v3", "M16 3h3a2 2 0 0 1 2 2v3", "M8 21H5a2 2 0 0 1-2-2v-3", "M16 21h3a2 2 0 0 0 2-2v-3"],
  help: ["M9.5 9a2.5 2.5 0 1 1 3.4 2.34c-.9.34-1.4 1-1.4 1.66", "M12 17h.01", "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18"],
  info: ["M12 11v6", "M12 7.5h.01", "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18"],
  progress: ["M12 4a5 5 0 1 0 0 10a5 5 0 1 0 0-10", "M8.5 13.5 7 21l5-3 5 3-1.5-7.5"],
  sound: ["M11 5 6 9H3v6h3l5 4z", "M15.5 8.5a5 5 0 0 1 0 7", "M18.5 5.5a9 9 0 0 1 0 13"],
  swap: ["M4 8h13l-3-3", "M20 16H7l3 3"],
};

function ChromeIcon({ icon }: { readonly icon: SimChromeIcon }): JSX.Element {
  return (
    <svg aria-hidden="true" className="eg-shell-simbar__icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {ICON_PATHS[icon].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}

export interface SimBarProps {
  readonly title: string;
  readonly chrome: SimChrome | null;
}

export function SimBar({ title, chrome }: SimBarProps): JSX.Element {
  const steps = chrome?.steps;
  return (
    <div className="eg-shell-simbar">
      <nav aria-label={t("shell.sim.crumbs")} className="eg-shell-simbar__crumbs">
        <a aria-label={t("shell.sim.back")} className="eg-shell-simbar__back" href={routeHref("simulators")}>
          <svg aria-hidden="true" className="eg-shell-simbar__icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="eg-shell-simbar__backLabel">{t("shell.nav.simulators")}</span>
        </a>
        <span aria-hidden="true" className="eg-shell-simbar__sep">›</span>
      </nav>
      <h1 className="eg-shell-simbar__title">{title}</h1>
      {steps !== undefined && steps.labels.length > 0 && (
        <ol aria-label={t("shell.sim.steps")} className="eg-shell-simbar__steps">
          {steps.labels.map((label, index) => (
            <li
              aria-current={index === steps.current ? "step" : undefined}
              className={
                index < steps.current
                  ? "eg-shell-simbar__step eg-shell-simbar__step--done"
                  : index === steps.current
                    ? "eg-shell-simbar__step eg-shell-simbar__step--current"
                    : "eg-shell-simbar__step"
              }
              key={label}
            >
              <span aria-hidden="true" className="eg-shell-simbar__stepNum">{index + 1}</span>
              <span className="eg-shell-simbar__stepLabel">{label}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="eg-shell-simbar__spacer" />
      {(chrome?.chips ?? []).map((chip) => (
        <span className={`eg-shell-simbar__chip eg-shell-simbar__chip--${chip.tone ?? "neutral"}`} key={chip.id}>
          {chip.label}
        </span>
      ))}
      {(chrome?.actions ?? []).length > 0 && (
        <div aria-label={t("shell.sim.actions")} className="eg-shell-simbar__actions" role="group">
          {(chrome?.actions ?? []).map((action) => (
            <button
              aria-label={action.label}
              aria-pressed={action.pressed}
              className="eg-shell-simbar__action"
              key={action.id}
              onClick={() => action.onSelect()}
              title={action.label}
              type="button"
            >
              <ChromeIcon icon={action.icon} />
              <span className="eg-shell-simbar__actionLabel">{action.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
