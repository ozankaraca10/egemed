import type { GamiRewardMarks } from "./model";
import { useState, type ReactNode } from "react";
import type { Cohort, GamiLeaderboardRow, MonthlyReward, RewardWinner } from "@egemed/gamification-core";
import { GamiAvatar } from "./GamiAvatar";
import { GamiModal } from "./GamiModal";
import { NOOP_GAMI_MODAL_ENV, type GamiFocusable, type GamiModalEnv } from "./modal";
import type { GamiAvatarOf, GamiIcons, GamiMeStatus, GamiTableItem } from "./types";

const tr1 = (n: number | null) => (n === null ? "—" : n.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const trInt = (n: number) => n.toLocaleString("tr-TR");
const nameOf = (r: GamiLeaderboardRow) => (r.isPublic ? r.displayName : null);
const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const gamiMonthTitle = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export function GamiDelta({ delta, icon }: { delta: number | null; icon: ReactNode }) {
  if (delta === null) return null;
  if (delta === 0) return <span className="eg-gami-delta same" aria-label="önceki döneme göre sıra değişmedi">—</span>;
  const up = delta > 0;
  return (
    <span className={`eg-gami-delta ${up ? "up" : "down"}`} aria-label={`önceki döneme göre ${Math.abs(delta)} sıra ${up ? "yukarı" : "aşağı"}`}>
      <span style={{ display: "inline-flex", transform: up ? undefined : "rotate(180deg)" }}>{icon}</span>{Math.abs(delta)}
    </span>
  );
}

export function GamiRewardBanner({ reward, compact, countdown, status, onTerms, onMonthly, onStatusAction, icons }: {
  reward: MonthlyReward;
  compact: boolean;
  countdown: string;
  status: GamiMeStatus | null;
  onTerms: (el: GamiFocusable) => void;
  onMonthly: () => void;
  onStatusAction: (a: NonNullable<GamiMeStatus["action"]>) => void;
  icons: Pick<GamiIcons, "gift" | "chevronRight" | "clock">;
}) {
  if (compact) {
    return (
      <div className="card eg-gami-reward compact">
        <span className="eg-gami-badge-ic eg-gami-cat-streak" aria-hidden="true">{icons.gift({ width: 16, height: 16 })}</span>
        <span className="txt">Bu ayın ödülü: <b>{reward.title}</b> · ilk {reward.winnersCount} kişiye · {countdown} kaldı</span>
        <button className="eg-gami-link" type="button" onClick={onMonthly}>Aylık sıralamayı gör {icons.chevronRight({ width: 14, height: 14 })}</button>
      </div>
    );
  }
  const chipCls = status?.tone === "green" ? "eg-gami-chip-green" : status?.tone === "purple" ? "eg-gami-chip-purple" : "gray";
  return (
    <section className="card eg-gami-reward" aria-labelledby="gami-rw-t">
      <span className="eg-gami-badge-ic eg-gami-cat-streak" aria-hidden="true">{icons.gift({ width: 30, height: 30 })}</span>
      <div>
        <span className="rs-lbl">{gamiMonthTitle(reward.month).toLocaleUpperCase("tr-TR")} ÖDÜLÜ · {reward.sponsor}</span>
        <h2 id="gami-rw-t">{reward.title}</h2>
        <p>{reward.description}</p>
      </div>
      <div className="eg-gami-reward-meta">
        <span className="badge orange">İlk {reward.winnersCount} kişiye verilir</span>
        <span className="badge gray" aria-live="off">{icons.clock({ width: 14, height: 14 })} Kapanışa {countdown}</span>
        {status && (status.action ? (
          <button type="button" className={`badge ${chipCls}`} style={{ border: 0, cursor: "pointer" }} onClick={() => onStatusAction(status.action!)}>Senin durumun: {status.text}</button>
        ) : (
          <span className={`badge ${chipCls}`}>Senin durumun: {status.text}</span>
        ))}
        <button className="btn outline small" type="button" onClick={(e) => onTerms(e.currentTarget as GamiFocusable)}>Katılım koşulları</button>
      </div>
    </section>
  );
}

export function GamiRewardTerms({ reward, returnTo, onClose, env = NOOP_GAMI_MODAL_ENV, closeIcon }: {
  reward: MonthlyReward;
  returnTo: GamiFocusable | null;
  onClose: () => void;
  env?: GamiModalEnv;
  closeIcon: ReactNode;
}) {
  return (
    <GamiModal title="Katılım koşulları" onClose={onClose} returnTo={returnTo} env={env} closeIcon={closeIcon}>
      <p style={{ marginTop: 0 }}><b>{reward.title}</b> — {reward.sponsor}</p>
      <ul>{reward.terms.map((t: string) => <li key={t}>{t}</li>)}</ul>
      <p className="eg-gami-note">Ödül, koşulları sağlayanlar arasında ilk {reward.winnersCount} kişiye verilir; koşulu sağlamayan biri ilk {reward.winnersCount}&apos;te olsa bile sıradaki uygun kişi ödül sırasına geçer.</p>
    </GamiModal>
  );
}

/** Ödül adayı / ödül dışı işareti (renk dışında metinle de ayırt edilir). */
function GamiRewardMark({ marks, id, small = false }: { marks: GamiRewardMarks | null; id: string; small?: boolean }) {
  if (marks === null) return null;
  const style = small ? { fontSize: "var(--fs-xs)", padding: "1px 8px", marginLeft: 6 } : undefined;
  if (marks.candidates.has(id)) return <span className="badge orange" style={style}>Ödül adayı</span>;
  const reason = marks.excluded.get(id);
  return reason === undefined ? null : <span className="badge gray" style={style}>{reason}</span>;
}

export function GamiPodium({ rows, candidates, avatarOf }: { rows: readonly GamiLeaderboardRow[]; candidates: GamiRewardMarks | null; avatarOf: GamiAvatarOf }) {
  const top = rows.filter((r) => r.rank !== null && r.rank <= 3).sort((a, b) => a.rank! - b.rank!);
  if (top.length < 3) return null;
  return (
    <ol className="eg-gami-podium" aria-label="İlk 3" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {top.map((r) => (
        <li key={r.id} className={`card eg-gami-podium-card r${r.rank}${r.isMe ? " me" : ""}`}>
          <span className={`eg-gami-medal m${r.rank}`} aria-label={`${r.rank}. sıra`}>{r.rank}</span>
          <GamiRewardMark marks={candidates} id={r.id} />
          <GamiAvatar model={avatarOf(r.id, nameOf(r))} size="lg" />
          <span className="nm">{r.isMe ? `Sen · ${r.displayName}` : r.displayName}</span>
          <span className="sc">{tr1(r.periodScore)}</span>
          <span className="sc-lbl">Dönem puanı</span>
          <span className="sub">Seviye {r.level} · {r.attemptsCount} deneme</span>
        </li>
      ))}
    </ol>
  );
}

export function GamiLeaderboardTable({ items, candidates, meDelta, avatarOf, deltaIcon }: {
  items: GamiTableItem[];
  candidates: GamiRewardMarks | null;
  meDelta: number | null;
  avatarOf: GamiAvatarOf;
  deltaIcon: ReactNode;
}) {
  if (items.length === 0) return null;
  const cand = (r: GamiLeaderboardRow) => <GamiRewardMark marks={candidates} id={r.id} small />;
  return (
    <>
      <div className="table-scroll eg-gami-lb-table-wrap">
        <table className="report-table report-table-v2 eg-gami-lb-table">
          <caption className="sr-only">Liderlik tablosu</caption>
          <thead><tr><th>#</th><th>Kullanıcı</th><th className="num">Dönem puanı</th><th className="num">Deneme</th><th className="num">Seviye</th><th className="num">Toplam XP</th></tr></thead>
          <tbody>
            {items.map((it, i) => it.kind === "gap" ? (
              <tr key={`gap-${i}`} className="gap" aria-hidden="true"><td colSpan={6}>⋯</td></tr>
            ) : (
              <tr key={it.row.id} className={it.row.isMe ? "me" : undefined} aria-current={it.row.isMe ? "true" : undefined}>
                <td className="rank">{it.row.rank}</td>
                <td><span className="user"><GamiAvatar model={avatarOf(it.row.id, nameOf(it.row))} />{it.row.isMe ? <>Sen <small>· {it.row.displayName}</small></> : it.row.displayName}{cand(it.row)}</span></td>
                <td className="num score">{tr1(it.row.periodScore)}{it.row.isMe && <GamiDelta delta={meDelta} icon={deltaIcon} />}</td>
                <td className="num">{it.row.attemptsCount}</td>
                <td className="num">{it.row.level}</td>
                <td className="num">{trInt(it.row.totalXp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="eg-gami-lb-cards" aria-label="Liderlik tablosu">
        {items.map((it, i) => it.kind === "gap" ? <li key={`gap-${i}`} className="gap" aria-hidden="true">⋯</li> : (
          <li key={it.row.id} className={it.row.isMe ? "me" : undefined}>
            <span className="rank">{it.row.rank}</span>
            <GamiAvatar model={avatarOf(it.row.id, nameOf(it.row))} />
            <span className="nm">{it.row.isMe ? `Sen · ${it.row.displayName}` : it.row.displayName}{cand(it.row)}</span>
            <span className="sub">Seviye {it.row.level} · {it.row.attemptsCount} deneme · {trInt(it.row.totalXp)} XP</span>
            <span className="sc">{tr1(it.row.periodScore)}{it.row.isMe && <GamiDelta delta={meDelta} icon={deltaIcon} />}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

export function GamiPrivacyCard({ name, isPublic, cohort, onChange, id, lockIcon }: {
  name: string | null;
  isPublic: boolean;
  cohort: Cohort | null;
  onChange: (patch: { public?: boolean; cohort?: Cohort | null }) => void;
  id?: string;
  lockIcon: ReactNode;
}) {
  return (
    <div className="card eg-gami-privacy" id={id}>
      {lockIcon}
      <div className="txt">
        <b>{isPublic ? "Sıralamada adınla görünüyorsun." : "Sıralamada \"Anonim öğrenci\" olarak görünüyorsun."}</b>
        <span>Adın kurum kaydından alınır{name ? ` (${name})` : ""}. İstersen anonim görünebilirsin; ayın ödülüne aday olmak için adınla görünmelisin.</span>
      </div>
      <div className="form">
        <label>Dönemin
          <select className="eg-gami-select" value={cohort ?? ""} onChange={(e) => onChange({ cohort: (e.target as { value: string }).value ? (Number((e.target as { value: string }).value) as Cohort) : null })}>
            <option value="">Belirtilmedi</option>
            {[1, 2, 3, 4, 5, 6].map((c) => <option key={c} value={c}>Dönem {c}</option>)}
          </select>
        </label>
        <label>
          <button className="eg-gami-switch" role="switch" type="button" aria-checked={isPublic} aria-label="Sıralamada adımı göster" onClick={() => onChange({ public: !isPublic })} />
          Sıralamada adımı göster
        </label>
      </div>
    </div>
  );
}

export function GamiRewardHistory({ winners, chevron }: { winners: RewardWinner[]; chevron: ReactNode }) {
  const [open, setOpen] = useState(false);
  const months = [...new Set(winners.map((w) => w.month))];
  if (!months.length) return null;
  return (
    <details className="card eg-gami-history" open={open} onToggle={(e) => setOpen((e.target as unknown as { open: boolean }).open)}>
      <summary>{chevron} Önceki ayların kazananları</summary>
      <div className="eg-gami-history-list">
        {months.map((m) => (
          <div className="eg-gami-history-month" key={m}>
            <b>{gamiMonthTitle(m)}</b>
            <ol>{winners.filter((w) => w.month === m).map((w) => (
              <li key={w.rank}><span className={`eg-gami-medal m${w.rank}`} aria-label={`${w.rank}.`}>{w.rank}</span>{w.displayName}</li>
            ))}</ol>
          </div>
        ))}
      </div>
    </details>
  );
}
