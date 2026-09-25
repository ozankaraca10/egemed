import type { ReactNode } from "react";
import type { WeeklyGoal } from "@egemed/gamification-core";

export function GamiWeeklyGoals({ goals, iconFor, doneIcon }: {
  goals: readonly WeeklyGoal[];
  iconFor: (id: WeeklyGoal["id"]) => ReactNode;
  doneIcon: ReactNode;
}) {
  return (
    <>
      <div className="eg-gami-goals">
        {goals.map((g) => (
          <div key={g.id} className={`eg-gami-goal${g.done ? " done" : ""}`}>
            <span className="dr-ic">{g.done ? doneIcon : iconFor(g.id)}</span>
            <span className="dr-lbl">{g.label}</span>
            {g.done ? <span className="badge green dr-pct">Tamamlandı</span> : <span className="dr-pct">{g.value} / {g.max}</span>}
            <span className="domain-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (g.value / g.max) * 100)}%` }} /></span>
          </div>
        ))}
      </div>
      <p className="eg-gami-note">Hedefler her Pazartesi 00:00&apos;da (TSİ) yenilenir.</p>
    </>
  );
}
