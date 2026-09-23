import { useId, useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from "react";

/** Sekme listesinde klavyeyle gezinme tuşları. */
export type TabKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

/** Döngüsel sekme indeksi (WAI-ARIA APG); `count <= 0` → -1. */
export function nextTabIndex(current: number, key: TabKey, count: number): number {
  if (count <= 0) return -1;
  const base = current < 0 || current >= count ? 0 : current;
  if (key === "ArrowLeft") return (base - 1 + count) % count;
  if (key === "ArrowRight") return (base + 1) % count;
  if (key === "Home") return 0;
  return count - 1;
}
export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly panel: ReactNode;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  /** `tablist` `aria-label`'ı; metin i18n sözlüğünden verilir. */
  readonly label: string;
  readonly defaultSelectedId?: string;
  readonly onChange?: (id: string) => void;
}

/** Odağı düğüme taşır; kök typecheck DOM lib'siz derlensin diye yapısal tip. */
function focusNode(node: unknown): void {
  (node as { focus?: () => void } | null)?.focus?.();
}

/**
 * Segmentli sekme grubu: `aria-controls`↔`aria-labelledby` bağları, roving
 * tabindex (etkin 0, diğerleri -1) ve ←/→/Home/End döngüsel gezinme. Etkin
 * sekme yalnız renkle değil, `aria-selected` + alt çizgiyle işaretlenir.
 */
export function Tabs({ items, label, defaultSelectedId, onChange }: TabsProps): JSX.Element {
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selectedId, setSelectedId] = useState(defaultSelectedId ?? items[0]?.id ?? "");
  const foundIndex = items.findIndex((item) => item.id === selectedId);
  // Geçersiz/eskimiş id'de ilk sekme etkinleşir; aksi hâlde tüm sekmeler
  // `tabIndex=-1` kalıp `tablist` klavyeyle hiç odaklanamaz (WCAG 2.1.1).
  const selectedIndex = foundIndex === -1 && items.length > 0 ? 0 : foundIndex;

  function select(id: string): void {
    setSelectedId(id);
    onChange?.(id);
  }
  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const { key } = event;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    event.preventDefault();
    const next = nextTabIndex(index, key, items.length);
    const item = items[next];
    if (item === undefined) return;
    select(item.id);
    focusNode(tabRefs.current[next]);
  }

  return (
    <div className="eg-tabs">
      <div aria-label={label} className="eg-tabs__list" role="tablist">
        {items.map((item, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              aria-controls={`${baseId}-panel-${index}`}
              aria-selected={selected}
              className="eg-tabs__tab"
              id={`${baseId}-tab-${index}`}
              key={item.id}
              onClick={() => select(item.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
              ref={(node) => { tabRefs.current[index] = node; }}
              role="tab"
              tabIndex={selected ? 0 : -1}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, index) => (
        <div
          aria-labelledby={`${baseId}-tab-${index}`}
          className="eg-tabs__panel"
          hidden={index !== selectedIndex}
          id={`${baseId}-panel-${index}`}
          key={item.id}
          role="tabpanel"
          tabIndex={0}
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}
