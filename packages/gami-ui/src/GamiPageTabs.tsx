import { useRef } from "react";
import type { ReactNode } from "react";
import type { GamiFocusable } from "./modal";

export type GamiPageTab = "achievements" | "leaderboard";

const TABS: { id: GamiPageTab; label: string }[] = [
  { id: "achievements", label: "Başarılarım" },
  { id: "leaderboard", label: "Liderlik Tahtası" },
];

export function GamiPageTabs({ active, onChange, icons }: {
  active: GamiPageTab;
  onChange: (id: GamiPageTab) => void;
  icons: { achievements: ReactNode; leaderboard: ReactNode };
}) {
  const refs = useRef<(GamiFocusable | null)[]>([]);
  const onKey = (e: { key: string; preventDefault(): void }, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    refs.current[next]?.focus();
    onChange(TABS[next]!.id);
  };
  return (
    <div className="eg-gami-pagetabs" role="tablist" aria-label="Oyunlaştırma">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[i] = el as GamiFocusable | null; }}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.id === "achievements" ? icons.achievements : icons.leaderboard} {t.label}
        </button>
      ))}
    </div>
  );
}
