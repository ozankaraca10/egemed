import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BadgeCategory } from "@egemed/gamification-core";
import { GamiSeg } from "./GamiSeg";
import { NOOP_GAMI_MODAL_ENV, gamiTabTrapTarget, type GamiFocusable, type GamiKeyEvent, type GamiModalEnv } from "./modal";
import type { GamiBadgeModel, GamiIcons } from "./types";

const badgeName = (v: GamiBadgeModel) => (v.tierLabel ? `${v.name} · ${v.tierLabel}` : v.name);
const stateText = (v: GamiBadgeModel) =>
  v.state === "earned" ? `kazanıldı ${v.earnedLabel ?? ""}` : v.state === "progress" ? `ilerleme ${v.value}/${v.max}` : `kilitli, koşul: ${v.rule}`;

export function GamiBadgeIc({ v, icons, size = "md" }: { v: GamiBadgeModel; icons: Pick<GamiIcons, "badge" | "lock">; size?: "sm" | "md" | "lg" }) {
  const tier = v.state === "earned" && v.tier ? ` tier-${v.tier}` : "";
  const px = size === "lg" ? 40 : size === "sm" ? 22 : 28;
  return (
    <span className={`eg-gami-badge-ic eg-gami-cat-${v.category}${tier}${v.state === "progress" ? " progress" : ""}${v.state === "locked" ? " locked" : ""}${size === "sm" ? " sm" : ""}`} aria-hidden="true">
      {icons.badge(v.iconName, px, v.category)}
      {v.state === "locked" && <span className="lock">{icons.lock({ width: 12, height: 12 })}</span>}
    </span>
  );
}

export function GamiBadgeCard({ v, icons, onOpen }: { v: GamiBadgeModel; icons: Pick<GamiIcons, "badge" | "lock" | "check">; onOpen: (v: GamiBadgeModel, el: GamiFocusable) => void }) {
  const state = v.state === "earned" ? "is-earned" : v.state === "progress" ? "is-progress" : "is-locked";
  return (
    <button
      className={`eg-gami-badge eg-gami-cat-${v.category} ${state}`}
      type="button"
      aria-label={`${badgeName(v)} (${v.categoryLabel}) — ${stateText(v)}`}
      onClick={(e) => onOpen(v, e.currentTarget as GamiFocusable)}
    >
      <GamiBadgeIc v={v} icons={icons} />
      <span className="cat">{v.categoryLabel}</span>
      <span className="nm">{badgeName(v)}</span>
      <span className="ds">{v.description}</span>
      <span className="ft">
        {v.state === "earned" && <>{icons.check({ width: 13, height: 13 })} {v.earnedLabel}</>}
        {v.state === "progress" && <><span className="domain-bar"><i style={{ width: `${v.max === 0 ? 0 : (v.value / v.max) * 100}%` }} /></span><span>{v.value}/{v.max}</span></>}
        {v.state === "locked" && <>{icons.lock({ width: 13, height: 13 })} {v.rule}</>}
      </span>
    </button>
  );
}

type Filter = "all" | "earned" | "progress" | "locked";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tümü" }, { id: "earned", label: "Kazanılanlar" }, { id: "progress", label: "Devam edenler" }, { id: "locked", label: "Kilitli" },
];

export function GamiBadgeGrid({ views, categories, onStudy, id, env = NOOP_GAMI_MODAL_ENV, icons }: {
  views: GamiBadgeModel[];
  categories: { id: BadgeCategory; label: string }[];
  onStudy: (key: string) => void;
  id?: string;
  env?: GamiModalEnv;
  icons: Pick<GamiIcons, "badge" | "lock" | "check" | "close" | "book">;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<{ v: GamiBadgeModel; from: GamiFocusable } | null>(null);
  const shown = filter === "all" ? views : views.filter((v) => v.state === filter);
  const earned = views.filter((v) => v.state === "earned").length;
  return (
    <section className="card" id={id} aria-labelledby="gami-badges-t">
      <div className="eg-gami-card-head">
        <h3 id="gami-badges-t">Rozet koleksiyonu</h3>
        <GamiSeg options={FILTERS} value={filter} onChange={setFilter} label="Rozet filtresi" />
        <span className="eg-gami-count">{earned} / {views.length} kazanıldı</span>
      </div>
      <div className="eg-gami-cat-legend" aria-label="Rozet kategorileri">
        {categories.map((c) => <span key={c.id} className={`eg-gami-cat-${c.id}`}><i />{c.label}</span>)}
      </div>
      <div className="eg-gami-badge-grid">
        {shown.map((v) => <GamiBadgeCard key={v.id} v={v} icons={icons} onOpen={(bv, el) => setOpen({ v: bv, from: el })} />)}
      </div>
      {shown.length === 0 && <p className="eg-gami-note">Bu filtrede rozet yok.</p>}
      {open && <GamiBadgeDetail v={open.v} returnTo={open.from} onClose={() => setOpen(null)} onStudy={onStudy} env={env} icons={icons} />}
    </section>
  );
}

export function GamiRecentBadges({ views, onAll, onStudy, env = NOOP_GAMI_MODAL_ENV, icons, emptyNote }: {
  views: GamiBadgeModel[];
  onAll: () => void;
  onStudy: (key: string) => void;
  env?: GamiModalEnv;
  icons: Pick<GamiIcons, "badge" | "lock" | "check" | "close" | "book" | "chevronRight">;
  emptyNote?: ReactNode;
}) {
  const [open, setOpen] = useState<{ v: GamiBadgeModel; from: GamiFocusable } | null>(null);
  const recent = views.filter((v) => v.state === "earned").slice(0, 3);
  return (
    <>
      {recent.length ? (
        <div className="eg-gami-recent">{recent.map((v) => <GamiBadgeCard key={v.id} v={v} icons={icons} onOpen={(bv, el) => setOpen({ v: bv, from: el })} />)}</div>
      ) : (
        <p className="eg-gami-note">{emptyNote ?? "Henüz rozet yok — ilk değerlendirmen \"İlk Adım\" rozetini getirir."}</p>
      )}
      <p className="eg-gami-note"><button className="eg-gami-link" type="button" onClick={onAll}>Tümünü gör {icons.chevronRight({ width: 14, height: 14 })}</button></p>
      {open && <GamiBadgeDetail v={open.v} returnTo={open.from} onClose={() => setOpen(null)} onStudy={onStudy} env={env} icons={icons} />}
    </>
  );
}

const FOCUSABLE_SELECTOR = "button, [href], [tabindex]:not([tabindex=\"-1\"])";

export function GamiBadgeDetail({ v, returnTo, onClose, onStudy, env = NOOP_GAMI_MODAL_ENV, icons }: {
  v: GamiBadgeModel;
  returnTo: GamiFocusable;
  onClose: () => void;
  onStudy: (key: string) => void;
  env?: GamiModalEnv;
  icons: Pick<GamiIcons, "badge" | "lock" | "close" | "book">;
}) {
  const cardRef = useRef<unknown>(null);
  const closeRef = useRef<GamiFocusable | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: GamiKeyEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab") return;
      const focusables = env.queryFocusables(cardRef.current, FOCUSABLE_SELECTOR);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const target = gamiTabTrapTarget(e.shiftKey, env.activeElement, first, last);
      if (target === "last") { e.preventDefault(); last?.focus(); }
      else if (target === "first") { e.preventDefault(); first?.focus(); }
    };
    env.addEventListener("keydown", onKey);
    return () => { env.removeEventListener("keydown", onKey); returnTo.focus(); };
  }, [onClose, returnTo, env]);
  const left = v.max - v.value;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gami-bd-t" onClick={onClose}>
      <div className="modal-card" ref={(el) => { cardRef.current = el; }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id="gami-bd-t">Rozet</h3>
          <button ref={(el) => { closeRef.current = el as GamiFocusable | null; }} className="modal-close" type="button" aria-label="Kapat" onClick={onClose}>{icons.close({})}</button>
        </div>
        <div className="modal-body">
          <div className={`eg-gami-badge-detail eg-gami-cat-${v.category}`}>
            <GamiBadgeIc v={v} icons={icons} size="lg" />
            <span className="cat">{v.categoryLabel} rozeti</span>
            <h4>{badgeName(v)}</h4>
            <p className="rule">{v.description}{v.assessmentOnly ? " Yalnız değerlendirme modundaki doğru yanıtlar sayılır." : ""}</p>
            {v.state === "earned" ? (
              <span className="badge green">Kazanıldı · {v.earnedLabel}</span>
            ) : v.lockedNote ? (
              <span className="eg-gami-count">{v.lockedNote}</span>
            ) : (
              <>
                <span className="domain-bar" aria-hidden="true"><i style={{ width: `${v.max === 0 ? 0 : (v.value / v.max) * 100}%` }} /></span>
                <span className="eg-gami-count">{v.value} / {v.max} — {left} kaldı</span>
              </>
            )}
            {v.studyKey && v.state !== "earned" && (
              <button className="btn green small" type="button" onClick={() => { onClose(); onStudy(v.studyKey!); }}>
                {icons.book({ width: 16, height: 16 })} Bu konuyu öğrenme modunda çalış
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
