import { useEffect, useRef, useState } from 'react'
import type { OpacaBadgeContext } from '../../gamification/catalog'
import type { OpacaStats } from '../../gamification/stats'
import { NOOP_MODAL_ENV, tabTrapTarget, type ModalEnv, type ModalFocusable, type ModalKeyEvent } from '../modal-env'
import * as Icons from '../icons'
import { GamiSeg } from './GamiSeg'
import { BADGE_CATEGORY_LABEL, BADGE_TIER_LABEL, trDate, type BadgeView } from '@egemed/gamification-core'
import type { BadgeCategory } from '@egemed/gamification-core'

type OpacaBadgeView = BadgeView<OpacaStats, OpacaBadgeContext>

type IconName = keyof typeof Icons
function BadgeIcon({ name, size }: { name: string; size: number }) {
  const C = (Icons as Record<string, (p: { width?: number; height?: number }) => React.ReactElement>)[`Icon${name}` as IconName]
  return C ? <C width={size} height={size} /> : null
}

const badgeName = (v: OpacaBadgeView) => (v.def.tier ? `${v.def.name} · ${BADGE_TIER_LABEL[v.def.tier]}` : v.def.name)
const stateText = (v: OpacaBadgeView) =>
  v.state === 'earned' ? `kazanıldı ${trDate(v.earnedAt!)}` : v.state === 'progress' ? `ilerleme ${v.value}/${v.max}` : `kilitli, koşul: ${v.rule}`

export function GamiBadgeIc({ v, size = 'md' }: { v: OpacaBadgeView; size?: 'sm' | 'md' | 'lg' }) {
  const cls = v.state === 'earned' ? (v.def.tier ? ` tier-${v.def.tier}` : '') : v.state === 'progress' ? ' progress' : ' locked'
  const px = size === 'lg' ? 40 : size === 'sm' ? 22 : 28
  return (
    <span className={`gami-badge-ic gami-cat-${v.def.category}${cls}${size === 'sm' ? ' sm' : ''}`} aria-hidden="true">
      <BadgeIcon name={v.def.icon ?? 'Star'} size={px} />
      {v.state === 'locked' && <span className="lock"><Icons.IconLock width={12} height={12} /></span>}
    </span>
  )
}

/** Rozet kartı (T0 onaylı tasarım): kategori renkli madalyon, kategori etiketi, ad, açıklama, alt satır. */
const FOCUSABLE_SELECTOR = 'button, [href], [tabindex]:not([tabindex="-1"])'

export function GamiBadgeCard({ v, onOpen }: { v: OpacaBadgeView; onOpen: (v: OpacaBadgeView, el: ModalFocusable) => void }) {
  const state = v.state === 'earned' ? 'is-earned' : v.state === 'progress' ? 'is-progress' : 'is-locked'
  return (
    <button
      className={`gami-badge gami-cat-${v.def.category} ${state}`}
      type="button"
      aria-label={`${badgeName(v)} (${BADGE_CATEGORY_LABEL[v.def.category]}) — ${stateText(v)}`}
      onClick={(e) => onOpen(v, e.currentTarget as ModalFocusable)}
    >
      <GamiBadgeIc v={v} />
      <span className="cat">{BADGE_CATEGORY_LABEL[v.def.category]}</span>
      <span className="nm">{badgeName(v)}</span>
      <span className="ds">{v.def.description}</span>
      <span className="ft">
        {v.state === 'earned' && <><Icons.IconCheck width={13} height={13} /> {trDate(v.earnedAt!)}</>}
        {v.state === 'progress' && <><span className="domain-bar"><i style={{ width: `${(v.value / v.max) * 100}%` }} /></span><span>{v.value}/{v.max}</span></>}
        {v.state === 'locked' && <><Icons.IconLock width={13} height={13} /> {v.rule}</>}
      </span>
    </button>
  )
}

type Filter = 'all' | 'earned' | 'progress' | 'locked'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tümü' }, { id: 'earned', label: 'Kazanılanlar' }, { id: 'progress', label: 'Devam edenler' }, { id: 'locked', label: 'Kilitli' },
]

/** Rozet koleksiyonu: filtre, sayaç, kategori lejantı, ızgara, detay penceresi. */
export function GamiBadgeGrid({ views, onStudy, id, env = NOOP_MODAL_ENV }: { views: OpacaBadgeView[]; onStudy: (key: string) => void; id?: string; env?: ModalEnv }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<{ v: OpacaBadgeView; from: ModalFocusable } | null>(null)
  const shown = filter === 'all' ? views : views.filter((v) => v.state === filter)
  const earned = views.filter((v) => v.state === 'earned').length
  return (
    <section className="card" id={id} aria-labelledby="gami-badges-t">
      <div className="gami-card-head">
        <h3 id="gami-badges-t">Rozet koleksiyonu</h3>
        <GamiSeg options={FILTERS} value={filter} onChange={setFilter} label="Rozet filtresi" />
        <span className="gami-count">{earned} / {views.length} kazanıldı</span>
      </div>
      <div className="gami-cat-legend" aria-label="Rozet kategorileri">
        {(Object.keys(BADGE_CATEGORY_LABEL) as BadgeCategory[]).map((c) => <span key={c} className={`gami-cat-${c}`}><i />{BADGE_CATEGORY_LABEL[c]}</span>)}
      </div>
      <div className="gami-badge-grid">
        {shown.map((v) => <GamiBadgeCard key={v.def.id} v={v} onOpen={(bv, el) => setOpen({ v: bv, from: el })} />)}
      </div>
      {shown.length === 0 && <p className="gami-note">Bu filtrede rozet yok.</p>}
      {open && <GamiBadgeDetail v={open.v} returnTo={open.from} onClose={() => setOpen(null)} onStudy={onStudy} env={env} />}
    </section>
  )
}

/** Son kazanılan 3 rozet (kompakt). */
export function GamiRecentBadges({ views, onAll, onStudy, env = NOOP_MODAL_ENV }: { views: OpacaBadgeView[]; onAll: () => void; onStudy: (key: string) => void; env?: ModalEnv }) {
  const [open, setOpen] = useState<{ v: OpacaBadgeView; from: ModalFocusable } | null>(null)
  const recent = views.filter((v) => v.state === 'earned').slice(0, 3)
  return (
    <>
      {recent.length ? (
        <div className="gami-recent">{recent.map((v) => <GamiBadgeCard key={v.def.id} v={v} onOpen={(bv, el) => setOpen({ v: bv, from: el })} />)}</div>
      ) : (
        <p className="gami-note">Henüz rozet yok — ilk değerlendirmen "İlk Adım" rozetini getirir.</p>
      )}
      <p className="gami-note"><button className="gami-link" type="button" onClick={onAll}>Tümünü gör <Icons.IconChevronRight width={14} height={14} /></button></p>
      {open && <GamiBadgeDetail v={open.v} returnTo={open.from} onClose={() => setOpen(null)} onStudy={onStudy} env={env} />}
    </>
  )
}

/** Rozet detay penceresi (ConfirmModal kalıbı: Esc kapatır, odak tuzağı, kapanınca odak karta döner). */
export function GamiBadgeDetail({ v, returnTo, onClose, onStudy, env = NOOP_MODAL_ENV }: { v: OpacaBadgeView; returnTo: ModalFocusable; onClose: () => void; onStudy: (key: string) => void; env?: ModalEnv }) {
  const cardRef = useRef<unknown>(null)
  const closeRef = useRef<ModalFocusable | null>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: ModalKeyEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key !== 'Tab') return
      const focusables = env.queryFocusables(cardRef.current, FOCUSABLE_SELECTOR)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const target = tabTrapTarget(e.shiftKey, env.activeElement, first, last)
      if (target === 'last') { e.preventDefault(); last?.focus() }
      else if (target === 'first') { e.preventDefault(); first?.focus() }
    }
    env.addEventListener('keydown', onKey)
    return () => { env.removeEventListener('keydown', onKey); returnTo.focus() }
  }, [onClose, returnTo, env])
  const left = v.max - v.value
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="gami-bd-t" onClick={onClose}>
      <div className="modal-card" ref={(el) => { cardRef.current = el }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 id="gami-bd-t">Rozet</h3>
          <button ref={(el) => { closeRef.current = el as ModalFocusable | null }} className="modal-close" type="button" aria-label="Kapat" onClick={onClose}><Icons.IconClose /></button>
        </div>
        <div className="modal-body">
          <div className={`gami-badge-detail gami-cat-${v.def.category}`}>
            <GamiBadgeIc v={v} size="lg" />
            <span className="cat">{BADGE_CATEGORY_LABEL[v.def.category]} rozeti</span>
            <h4>{badgeName(v)}</h4>
            <p className="rule">{v.def.description}{v.def.category === 'topic' || v.def.category === 'skill' ? ' Yalnız değerlendirme modundaki doğru yanıtlar sayılır.' : ''}</p>
            {v.state === 'earned' ? (
              <span className="badge green">Kazanıldı · {trDate(v.earnedAt!)}</span>
            ) : v.def.id === 'podium' ? (
              <span className="gami-count">Sunucu bağlantısı gelince kazanılabilir (şu an demo sıralama).</span>
            ) : (
              <>
                <span className="domain-bar" aria-hidden="true"><i style={{ width: `${(v.value / v.max) * 100}%` }} /></span>
                <span className="gami-count">{v.value} / {v.max} — {left} kaldı</span>
              </>
            )}
            {v.studyKey && v.state !== 'earned' && (
              <button className="btn green small" type="button" onClick={() => { onClose(); onStudy(v.studyKey!) }}>
                <Icons.IconBook width={16} height={16} /> Bu konuyu öğrenme modunda çalış
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
