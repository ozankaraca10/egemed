import { useEffect, useState, type JSX } from "react";
import { Menu, icons, type MenuEntry } from "@egemed/ui";
import { SIMULATOR_IDS, type SimChrome, type SimChromeAction, type SimChromeIcon, type SimulatorId } from "@egemed/sim-host";
import { t } from "@egemed/ui/i18n";
import { routeHref, simHref } from "./routes";

/**
 * Birleşik bar (UX kararı 25 Eyl, yeniden tasarım 26 Eyl 2026): sim rotasında
 * kabuğun üst barı simin barına dönüşür ve ÜÇ SİMDE AYNI yapıyı taşır:
 *
 *   [logo → ana sayfa] [Sim ▾ değiştirici] [① ② ③ adımlar] … [eylemler] [hesap]
 *
 * - Geri düğmesi yoktur; "Sim ▾" menüsü diğer simleri ve "Tüm simülatörler"i verir.
 * - Her öğe tıklanabilir: tamamlanan adımlar (sim destekliyorsa), mod çipi
 *   (mod seçimine döner). Süre/ilerleme gibi durumlar düğme görünümü almaz.
 * - Sabit eylem sırası: [sime özgü] · İlerlemem · Tam ekran · Yardım.
 *   Tam ekranı kabuk yönetir (belge düzeyinde; bar tam ekranda da kalır) ve
 *   simin kendi tam ekran eylemi yok sayılır. Hakkında simin içinde
 *   yoktur (T276b); kabuğun `#/hakkinda` sayfasındadır.
 * - <768 px'te eylemler "⋯" menüsünde toplanır (yatay taşma yok).
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

/** Kabuğun bara koyduğu eylem (simden gelen ya da kabuğun kendi eylemi). */
interface BarAction {
  readonly id: string;
  readonly label: string;
  readonly icon: SimChromeIcon;
  readonly pressed?: boolean | undefined;
  readonly onSelect: () => void;
}

/** Sabit sıra yuvası: sime özgü eylemler önce, ardından ortak dört eylem. */
function slotOf(action: SimChromeAction): number {
  switch (action.icon) {
    case "progress":
      return 1;
    case "help":
      return 3;
    case "info":
      return 4;
    default:
      return 0;
  }
}

/** Sim eylemlerini sabit sıraya dizer; tam ekranı kabuk verir. */
export function orderBarActions(
  simActions: readonly SimChromeAction[],
  shell: { readonly fullscreen: boolean; readonly toggleFullscreen: () => void },
): BarAction[] {
  // T276b: Hakkında simin içinde gösterilmez (kabuğun `#/hakkinda` sayfası); tam ekranı kabuk verir.
  const own = simActions.filter((action) => action.icon !== "fullscreen" && action.icon !== "info");
  const sorted = own
    .map((action, index) => ({ action, index }))
    .sort((a, b) => slotOf(a.action) - slotOf(b.action) || a.index - b.index)
    .map(({ action }): BarAction => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      pressed: action.pressed,
      onSelect: () => action.onSelect(),
    }));
  const fullscreen: BarAction = {
    id: "fullscreen",
    label: t(shell.fullscreen ? "shell.sim.action.fullscreenExit" : "shell.sim.action.fullscreen"),
    icon: "fullscreen",
    pressed: shell.fullscreen,
    onSelect: shell.toggleFullscreen,
  };
  // Tam ekran İlerlemem'den sonra, Yardım'dan önce (yuva 2).
  const helpAt = sorted.findIndex((action) => action.icon === "help" || action.icon === "info");
  const result = helpAt === -1 ? [...sorted, fullscreen] : [...sorted.slice(0, helpAt), fullscreen, ...sorted.slice(helpAt)];
  return result;
}

/** Belge düzeyinde tam ekran (26 Eyl 2026 kararı); DOM yoksa (SSR/test) sessizce hiçbir şey yapmaz. */
function useDocumentFullscreen(): { readonly fullscreen: boolean; readonly toggle: () => void } {
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement !== null) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  return { fullscreen, toggle };
}

function navigate(href: `#${string}`): void {
  const scope = globalThis as { location?: { hash: string } };
  if (scope.location !== undefined) scope.location.hash = href;
}

export interface SimBarProps {
  readonly simId: SimulatorId;
  readonly title: string;
  readonly chrome: SimChrome | null;
}

export function SimBar({ simId, title, chrome }: SimBarProps): JSX.Element {
  const steps = chrome?.steps;
  const { fullscreen, toggle } = useDocumentFullscreen();
  const actions = orderBarActions(chrome?.actions ?? [], {
    fullscreen,
    toggleFullscreen: toggle,
  });

  const switchItems: MenuEntry[] = [
    ...SIMULATOR_IDS.filter((id) => id !== simId).map((id): MenuEntry => ({
      key: id,
      label: t(`sims.${id}.name`),
      icon: <img alt="" className="eg-shell-simbar__menuLogo" height={20} src={`/brand/sims/${id}-icon-white.png`} width={20} />,
      onSelect: () => navigate(simHref(id)),
    })),
    { kind: "separator", key: "sep" },
    { key: "all", label: t("shell.sim.all"), icon: <icons.LayoutDashboard />, onSelect: () => navigate(routeHref("simulators")) },
  ];

  const selectStep = steps?.onSelect;
  const modeChip = (chrome?.chips ?? []).find((chip) => chip.id === "mode");
  const modeSelect = modeChip?.onSelect ?? (selectStep === undefined ? undefined : () => selectStep(0));

  return (
    <div className="eg-shell-simbar">
      <h1 className="eg-shell-simbar__title">
        <Menu
          align="start"
          className="eg-shell-simbar__switchMenu"
          items={switchItems}
          trigger={
            <button className="eg-shell-simbar__switch" title={t("shell.sim.switch")} type="button">
              <img alt="" className="eg-shell-simbar__simLogo" height={24} src={`/brand/sims/${simId}-icon-white.png`} width={24} />
              <span className="eg-shell-simbar__simName">{title}</span>
              <icons.ChevronDown aria-hidden="true" className="eg-shell-simbar__chev" />
            </button>
          }
        />
      </h1>
      {steps !== undefined && steps.labels.length > 0 && (
        <ol aria-label={t("shell.sim.steps")} className="eg-shell-simbar__steps">
          {steps.labels.map((label, index) => {
            const done = index < steps.current;
            const current = index === steps.current;
            const className = done
              ? "eg-shell-simbar__step eg-shell-simbar__step--done"
              : current
                ? "eg-shell-simbar__step eg-shell-simbar__step--current"
                : "eg-shell-simbar__step";
            const body = (
              <>
                <span aria-hidden="true" className="eg-shell-simbar__stepNum">{index + 1}</span>
                <span className="eg-shell-simbar__stepLabel">{label}</span>
              </>
            );
            return (
              <li aria-current={current ? "step" : undefined} className={className} key={label}>
                {done && selectStep !== undefined ? (
                  <button
                    className="eg-shell-simbar__stepButton"
                    onClick={() => selectStep(index)}
                    title={`${label} ${t("shell.sim.stepBack")}`}
                    type="button"
                  >
                    {body}
                  </button>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="eg-shell-simbar__spacer" />
      {(chrome?.chips ?? []).map((chip) =>
        chip.id === "mode" && modeSelect !== undefined ? (
          <button
            className={`eg-shell-simbar__chip eg-shell-simbar__chip--${chip.tone ?? "neutral"}`}
            key={chip.id}
            onClick={modeSelect}
            title={t("shell.sim.modeChange")}
            type="button"
          >
            {chip.label}
          </button>
        ) : (
          <span className="eg-shell-simbar__status" key={chip.id}>
            {chip.label}
          </span>
        ),
      )}
      <div aria-label={t("shell.sim.actions")} className="eg-shell-simbar__actions" role="group">
        {actions.map((action) => (
          <button
            aria-label={action.label}
            aria-pressed={action.pressed}
            className="eg-shell-simbar__action"
            key={action.id}
            onClick={action.onSelect}
            title={action.label}
            type="button"
          >
            <ChromeIcon icon={action.icon} />
            <span className="eg-shell-simbar__actionLabel">{action.label}</span>
          </button>
        ))}
      </div>
      <div className="eg-shell-simbar__more">
        <Menu
          items={actions.map((action): MenuEntry => ({
            key: action.id,
            label: action.label,
            icon: <ChromeIcon icon={action.icon} />,
            onSelect: action.onSelect,
          }))}
          trigger={
            <button aria-label={t("shell.sim.more")} className="eg-shell-simbar__action" type="button">
              <icons.MoreHorizontal aria-hidden="true" className="eg-shell-simbar__icon" />
            </button>
          }
        />
      </div>
    </div>
  );
}
