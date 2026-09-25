import type { ReactNode } from "react";
import { GamiAvatar } from "./GamiAvatar";
import type { GamiAvatarOf, GamiProfileModel } from "./types";

const tr = (n: number) => n.toLocaleString("tr-TR");

function LevelRing({ pct, children }: { pct: number; children: ReactNode }) {
  const c = 2 * Math.PI * 28;
  return (
    <div className="eg-gami-level-ring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="track" cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle className="prog" cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(c * Math.max(0, Math.min(1, pct))).toFixed(1)} 999`} transform="rotate(-90 32 32)" />
      </svg>
      {children}
    </div>
  );
}

export function GamiProfileStrip({ profile, avatarOf, onLeaderboard, icons }: {
  profile: GamiProfileModel;
  avatarOf: GamiAvatarOf;
  onLeaderboard: () => void;
  icons: { flame: ReactNode; check: ReactNode; chevron: ReactNode };
}) {
  const span = profile.xpSpan;
  const topPct = profile.weekRank && profile.weekRanked ? Math.max(1, Math.ceil((profile.weekRank / profile.weekRanked) * 100)) : null;
  const pass = profile.periodAvg !== null && profile.periodAvg >= 80;
  return (
    <div className="results-summary-strip eg-gami-profile">
      <div className="rs-box">
        <div className="eg-gami-level">
          <LevelRing pct={span === 0 ? 0 : profile.xpInto / span}>
            <GamiAvatar model={avatarOf(profile.avatarId, profile.avatarName)} />
          </LevelRing>
          <div>
            <b>Seviye {profile.level}</b>
            <small>{tr(profile.xpInto)} / {tr(span)} XP</small>
          </div>
        </div>
        <span className="rs-lbl">Sonraki seviyeye {tr(profile.xpToNext)} XP</span>
      </div>
      <div className="rs-box eg-gami-streak">
        <div className="rs-num">{icons.flame} {profile.streakCurrent} gün</div>
        <span className="eg-gami-sub">En uzun seri {profile.streakLongest} gün</span>
        <span className="rs-lbl">Günlük seri</span>
      </div>
      <div className="rs-box">
        <div className="rs-num">{profile.periodAssessments}</div>
        <span className="eg-gami-sub">+{profile.periodPractice} uygulama vakası</span>
        <span className="rs-lbl">Değerlendirme oturumu</span>
      </div>
      <div className="rs-box">
        {profile.periodAvg === null ? (
          <div className="rs-num">—</div>
        ) : (
          <div className={`rs-status ${pass ? "pass" : "fail"}`}>{icons.check} %{Math.round(profile.periodAvg)}</div>
        )}
        <span className="eg-gami-sub">Eşik 80 · {profile.periodLabel}</span>
        <span className="rs-lbl">Ortalama başarı</span>
      </div>
      <button className="rs-box eg-gami-rank-box" type="button" onClick={onLeaderboard}>
        {profile.weekRank ? (
          <div className="rs-num">{profile.weekRank}. <span className="eg-gami-sub">/ {profile.weekRanked}</span></div>
        ) : (
          <div className="rs-num">—</div>
        )}
        <span className="eg-gami-sub">{profile.weekRank && topPct ? `İlk %${topPct} içinde · bu hafta` : "Bu hafta sıralamada değilsin"}</span>
        <span className="eg-gami-link">Liderlik Tahtası {icons.chevron}</span>
      </button>
    </div>
  );
}
