import type { ReactNode } from "react";
import { GamiBadgeIc } from "./GamiBadge";
import { GamiDelta } from "./GamiLeaderboard";
import type { GamiGainsModel, GamiIcons } from "./types";

const tr = (n: number) => n.toLocaleString("tr-TR");

export function GamiGainsView({ gains, icons, onAchievements, onLeaderboard, demoLabel = "Demo verisi" }: {
  gains: GamiGainsModel;
  icons: Pick<GamiIcons, "badge" | "lock" | "star" | "chart" | "arrowRight" | "arrowUp">;
  onAchievements: () => void;
  onLeaderboard: () => void;
  /** Boş/verilmezse varsayılan; API oturumunda sim "" geçer ve etiket çizilmez. */
  demoLabel?: string;
}) {
  const b = gains.badge;
  return (
    <section className="card eg-gami-gains" aria-labelledby="gami-gains-t">
      <div className="eg-gami-card-head">
        <h3 id="gami-gains-t">Bu oturumda kazandıkların</h3>
        {demoLabel ? <span className="badge orange">{demoLabel}</span> : null}
      </div>
      {gains.confetti && <div className="eg-gami-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</div>}
      <div className="eg-gami-gains-row">
        <div className="eg-gami-gain">
          {b ? <GamiBadgeIc v={b} icons={icons} size="sm" /> : null}
          <div>
            {gains.badgeFresh && b ? (
              <><b>{b.name}</b><span>Yeni rozet{b.tierLabel ? ` · ${b.tierLabel}` : ""}</span></>
            ) : b ? (
              <><b>{b.name}</b><span>Sıradaki rozet · {b.value}/{b.max}</span></>
            ) : (
              <><b>Rozet</b><span>Tüm erişilebilir rozetler kazanıldı</span></>
            )}
          </div>
        </div>
        <div className="eg-gami-gain">
          <span className="eg-gami-badge-ic sm eg-gami-cat-topic progress" aria-hidden="true">{icons.star({ width: 22, height: 22 })}</span>
          <div><b className="xp">+{gains.xp} XP</b><span>{gains.bonus ? `+${gains.bonus} başarı bonusu dahil` : "Oturum XP'si"}</span></div>
        </div>
        <div className="eg-gami-gain">
          <div className="grow">
            <b>Seviye {gains.level}</b>
            <span>{tr(gains.xpInto)} / {tr(gains.xpSpan)} XP · sonrakine {tr(gains.xpToNext)}</span>
            <span className="domain-bar" aria-hidden="true"><i style={{ width: `${gains.xpSpan === 0 ? 0 : (gains.xpInto / gains.xpSpan) * 100}%` }} /></span>
          </div>
        </div>
        {gains.rank && (
          <div className="eg-gami-gain">
            <span className="eg-gami-badge-ic sm eg-gami-cat-skill progress" aria-hidden="true">{icons.chart({})}</span>
            <div>
              {gains.rank.rank ? (
                <><b className="rank">{gains.rank.period === "month" ? "Ödül sırası" : "Bu hafta"} {gains.rank.rank}. <GamiDelta delta={gains.rank.delta} icon={icons.arrowUp({ width: 12, height: 12 })} /></b><span>{gains.rank.of} kişi arasında</span></>
              ) : (
                <><b className="rank">Sıralamada değilsin</b><span>En az 2 değerlendirme gerekir</span></>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="eg-gami-gains-actions">
        <button className="btn outline small" type="button" onClick={onLeaderboard}>Sıralamaya bak</button>
        <button className="btn primary small" type="button" onClick={onAchievements}>Başarılarımı gör {icons.arrowRight({ width: 14, height: 14 })}</button>
      </div>
    </section>
  );
}

export type { ReactNode };
