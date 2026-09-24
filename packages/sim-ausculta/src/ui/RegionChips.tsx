/** Bölge listesi. Aktif nokta işaret + aria-pressed, dinlenmiş nokta onay imi taşır.
 *  Seçili durum renkten ayrı okunur. */
import type { AuscultationPoint, PatientView, PointVisit } from "../core/types";
import { regionChipState } from "../core/flow";

const HIT = { minWidth: 44, minHeight: 44 } as const;

export interface RegionChipListProps {
  points: readonly AuscultationPoint[];
  view: PatientView;
  pointIds?: readonly string[];
  activePoint: string | null;
  visits: Record<string, Pick<PointVisit, "listenMs"> | undefined>;
  onSelect: (pointId: string) => void;
  /** Değerlendirmede klavye odaklanana kadar ekran okuyucu dışında gizli. */
  hideUntilFocus?: boolean;
  otherViewHint?: string | null;
  title?: string;
}

export function visibleRegionPoints(
  points: readonly AuscultationPoint[],
  view: PatientView,
  pointIds?: readonly string[],
): AuscultationPoint[] {
  return points.filter((point) => point.view === view && (!pointIds || pointIds.includes(point.id)));
}

export function RegionChipList({
  points,
  view,
  pointIds,
  activePoint,
  visits,
  onSelect,
  hideUntilFocus,
  otherViewHint,
  title = "Dinleme bölgeleri",
}: RegionChipListProps) {
  const visible = visibleRegionPoints(points, view, pointIds);
  const wrapCls = hideUntilFocus ? "sr-only-until-focus" : "";
  return (
    <>
      <div className={`region-list-title ${wrapCls}`}>{title}</div>
      <div className={`region-list ${wrapCls}`} role="group" aria-label={title}>
        {visible.map((point) => {
          const state = regionChipState(point.id, activePoint, visits);
          const label =
            state === "active" ? `${point.fullLabel}, seçili` : state === "listened" ? `${point.fullLabel}, dinlendi` : point.fullLabel;
          return (
            <button
              key={point.id}
              type="button"
              className={state === "active" ? "is-active" : state === "listened" ? "is-listened" : ""}
              style={HIT}
              aria-pressed={state === "active"}
              aria-label={label}
              data-state={state}
              onClick={() => onSelect(point.id)}
            >
              {state === "active" && (
                <span className="rc-current" aria-hidden="true">
                  ●
                </span>
              )}
              {state === "listened" && (
                <span className="rc-check" aria-hidden="true">
                  ✓
                </span>
              )}
              {point.fullLabel}
            </button>
          );
        })}
        {otherViewHint && <span className="region-list-hint">{otherViewHint}</span>}
      </div>
    </>
  );
}
