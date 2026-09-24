import type { JSX } from "react";
import { useStore } from "../core/StoreProvider";
import { useGamiProgress } from "../gamification/useGami";
import { AUSCULTA_BADGES } from "../gamification/catalog";
import { badgeProgress } from "@egemed/gamification-core";
import type { LocalGamiRepository } from "../gamification/repo";
import { Footer, touchTarget } from "../ui/chrome";
import { ScreenHeading } from "../ui/ScreenHeading";

export function ProgressScreen({ embedded = false, repository }: { embedded?: boolean; repository: LocalGamiRepository }): JSX.Element {
  const { dispatch, now } = useStore();
  const progress = useGamiProgress(new Date(now()), repository);
  const attempts = progress.state.attempts;
  const latest = [...attempts].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))[0];
  const earnedIds = new Set(progress.state.earned.map((badge) => badge.id));
  return (
    <div className="screen eg-ausculta-progress">
      <main className="container screen-body">
        <ScreenHeading>İlerleme</ScreenHeading>
        <p className="eg-ausculta-progress__intro">Oskültasyon çalışmanızın özeti bu cihazda saklanır.</p>
        <section className="eg-ausculta-progress__summary" aria-label="Çalışma özeti">
          <div><strong>{progress.streak.current}</strong><span>günlük seri</span></div>
          <div><strong>{progress.level.level}</strong><span>seviye</span></div>
          <div><strong>{attempts.length}</strong><span>tamamlanan vaka</span></div>
        </section>
        <section className="eg-ausculta-progress__section" aria-labelledby="ausculta-goals-title">
          <h2 id="ausculta-goals-title">Bu haftaki hedefler</h2>
          {progress.goals.goals.map((goal) => (
            <div className="eg-ausculta-progress__goal" key={goal.id}>
              <div><span>{goal.label}</span><b>{goal.value}/{goal.max}</b></div>
              <progress value={goal.value} max={goal.max} aria-label={goal.label} />
            </div>
          ))}
        </section>
        <section className="eg-ausculta-progress__section" aria-labelledby="ausculta-badges-title">
          <h2 id="ausculta-badges-title">Rozetler</h2>
          <ul className="eg-ausculta-progress__badges">
            {AUSCULTA_BADGES.map((badge) => {
              const earned = earnedIds.has(badge.id);
              const badgeState = badgeProgress(badge, progress.state.stats, { now: new Date(now()) });
              const value = Math.max(0, Math.min(badgeState.value, badgeState.max));
              const max = badgeState.max;
              return <li className={earned ? "is-earned" : ""} key={badge.id}>
                <span className="eg-ausculta-progress__badge-mark" aria-hidden="true">{earned ? "✓" : "·"}</span>
                <div><strong>{badge.name}</strong><p>{badge.description}</p><progress value={value} max={max} aria-label={`${badge.name}: ${value}/${max}`} /></div>
                <span>{earned ? "Kazanıldı" : `${value}/${max}`}</span>
              </li>;
            })}
          </ul>
        </section>
        <p className="eg-ausculta-progress__recent">{latest ? `Son çalışma: ${latest.score} puan · ${latest.mode === "assessment" ? "Değerlendirme" : "Uygulama"}` : "Henüz tamamlanmış vaka yok. İlk vakanızdan sonra ilerlemeniz burada görünür."}</p>
        <button className="eg-ausculta-progress__back" style={touchTarget()} onClick={() => dispatch({ type: "goto", screen: "start" })}>Başlangıca dön</button>
      </main>
      <Footer embedded={embedded} />
    </div>
  );
}
