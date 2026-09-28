import type { JSX, ReactNode } from 'react'
import type { SimAudience } from '@egemed/sim-host'
import { audienceCanUseMode, VISITOR_LOCK_TEXT } from '@egemed/sim-host'
import { useStore } from '../core/StoreProvider'
import type { Mode } from '../core/types'
import { CASE_INVENTORY } from '../data/inventory'
import { LIBRARY_ITEMS } from '../data/terminology'
import { Footer, EcgDeco } from '../ui/chrome'
import { useSessions, useSetChrome } from '../EmbeddedContext'
import { ScreenHeading } from '../ui/ScreenHeading'
import { IconGraduation, IconFilm, IconChart, IconCheck, IconGift, IconLock } from '../ui/icons'

/** Sunucu oturumu vaka sayısı (banka `SESSION_CASE_COUNT` ile aynı). */
const SESSION_SIZE = 10

/** Ay sonuna kalan tam gün (TR; kaynak `gamification/leaderboardView.ts:daysLeft`). */
function daysLeftInMonth(nowMs: number): number {
  const TR_OFFSET_MS = 3 * 60 * 60 * 1000
  const now = new Date(nowMs)
  const w = new Date(now.getTime() + TR_OFFSET_MS)
  const nextMonthFirst = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth() + 1, 1, 0, 0, 0, 0) - TR_OFFSET_MS)
  const endOfMonth = new Date(nextMonthFirst.getTime() - 1)
  return Math.ceil((endOfMonth.getTime() + 1 - now.getTime()) / 86_400_000)
}

export interface ModeSelectScreenProps {
  /** Platform kabuğu modu: dekorasyon ve footer çizilmez (§7.3). */
  readonly embedded?: boolean
  /** Oyunlaştırma bayrağı (§7.7, G4); varsayılan kapalı. */
  readonly gamiEnabled?: boolean
  /** Kitle (T175); yoksa `student` (geriye uyum). */
  readonly audience?: SimAudience
  /** Ziyaretçi kilidindeki "Öğrenci girişi" eylemi. */
  readonly requestSignIn?: () => void
}

/** Mod seçim ekranı: Öğrenme (İnceleme) / Uygulama / Değerlendirme. */
export function ModeSelectScreen({
  embedded = false,
  gamiEnabled = false,
  audience = 'student',
  requestSignIn,
}: ModeSelectScreenProps): JSX.Element {
  const { state, dispatch, now } = useStore()
  const unified = useSetChrome() !== undefined
  const practiceCount = CASE_INVENTORY.practicePoolSize
  const assessmentCount = CASE_INVENTORY.assessmentPoolSize
  const recommendLearn = !state.tutorialSeen
  const isVisitor = audience === 'visitor'
  const isFaculty = audience === 'faculty'
  // Ziyaretçi kilidi gönderim kilidi değildir: kart pasifleşmez, düğme girişe yönlendirir.
  const canPractice = audienceCanUseMode(audience, 'practice')
  const canAssessment = audienceCanUseMode(audience, 'assessment')
  // A2.3: uygulama/değerlendirme vakaları yalnız sunucu oturumundan gelir; kanal yoksa kapalı.
  const serverReady = useSessions() !== undefined
  const signIn = () => requestSignIn?.()
  const pick = (mode: Mode) => {
    dispatch({ type: 'startMode', mode })
    if (mode === 'learn') dispatch({ type: 'goto', screen: 'learn' })
  }
  const pickOrRecommendLearn = (mode: Mode, poolReady: boolean) => {
    if (recommendLearn && poolReady && mode !== 'learn') {
      pick('learn')
      return
    }
    pick(mode)
  }
  return (
    <>
      <EcgDeco embedded={embedded} />
      <div className="screen" style={{ position: 'relative', zIndex: 1 }}>
        <div className="container screen-body">
          {unified ? null : <Stepper active={1} labels={['Mod seçimi', 'Çalışma', 'Tamamla']} />}
          {isVisitor && (
            <p className="visitor-banner" role="status">
              <IconLock width={16} height={16} aria-hidden="true" />
              <span><strong>{VISITOR_LOCK_TEXT.badge}</strong> — {VISITOR_LOCK_TEXT.locked}</span>
              {requestSignIn ? (
                <button type="button" className="btn outline small" onClick={signIn}>
                  {VISITOR_LOCK_TEXT.cta}
                </button>
              ) : null}
            </p>
          )}
          <ScreenHeading className="mode-title">Çalışma modunu seçin</ScreenHeading>
          <p className="mode-sub">Önce öğrenme modunda okuma sırasını oturtmanız önerilir.</p>
          {isFaculty && (
            <p className="mode-sub">Öğretim üyesi görünümü — rozet ve sıralama yalnız öğrenciler içindir.</p>
          )}
          <div className="mode-cards">
            <ModeCard
              kind="learn"
              icon={<IconGraduation />}
              title="Öğrenme Modu"
              text={`${LIBRARY_ITEMS.length} konuyu örnek filmler, okuma bölgeleri ve uzman işaretlemeleriyle inceleyin.`}
              items={['ABCDE okuma rehberi', 'Uzman işaretlemesi açılıp kapanır', 'Süre ve puan yok']}
              cta="Öğrenmeye başla"
              onPick={() => pick('learn')}
            />
            <ModeCard
              kind="practice"
              icon={<IconFilm />}
              title="Uygulama Modu"
              text={practiceCount ? `${practiceCount} vakalık havuzdan her oturumda rastgele ${Math.min(SESSION_SIZE, practiceCount)} vaka; ipucu ve geri bildirimle.` : 'Uygulama havuzu boş: önce veri setini içe aktarın.'}
              items={['Görüntü üzerinde işaretleme', 'İpucu desteği', 'Yanıttan sonra uzman işaretlemesi']}
              cta={!canPractice ? VISITOR_LOCK_TEXT.cta : recommendLearn && practiceCount ? 'Öğrenmeye git' : 'Vakaları çöz'}
              disabled={canPractice && (!practiceCount || !serverReady)}
              recommendLocked={canPractice && recommendLearn && !!practiceCount}
              locked={!canPractice}
              lockedText={VISITOR_LOCK_TEXT.modeLocked}
              onPick={!canPractice ? signIn : () => pickOrRecommendLearn('practice', !!practiceCount)}
              bestScore={state.bestScore.practice}
            />
            <ModeCard
              kind="assessment"
              icon={<IconChart />}
              title="Değerlendirme Modu"
              text={assessmentCount ? `${assessmentCount} radyolog etiketli vakalık havuzdan rastgele ${Math.min(SESSION_SIZE, assessmentCount)} vaka.` : 'Değerlendirme havuzu boş: radyolog etiketli veri seti içe aktarılmalı.'}
              items={['Okuma bölgesi ve uzman katmanı yok', 'Vaka başına süre sınırı', embedded ? 'Puan kaydedilir' : 'SCORM puanı']}
              rules="İpucu yok · geri bildirim yalnız sonunda · puan kaydedilir"
              cta={!canAssessment ? VISITOR_LOCK_TEXT.cta : recommendLearn && assessmentCount ? 'Öğrenmeye git' : 'Değerlendirmeye gir'}
              disabled={canAssessment && (!assessmentCount || !serverReady)}
              recommendLocked={canAssessment && recommendLearn && !!assessmentCount}
              locked={!canAssessment}
              lockedText={VISITOR_LOCK_TEXT.modeLocked}
              onPick={!canAssessment ? signIn : () => pickOrRecommendLearn('assessment', !!assessmentCount)}
              bestScore={state.bestScore.assessment}
              extra={gamiEnabled ? (
                <p className="mode-rules">
                  <button type="button" className="gami-link" style={{ color: 'var(--amber-700)' }} onClick={() => dispatch({ type: 'goto', screen: 'leaderboard' })}>
                    <IconGift width={14} height={14} /> Bu ayın ödülü · {daysLeftInMonth(now())} gün kaldı
                  </button>
                </p>
              ) : undefined}
            />
          </div>
        </div>
      </div>
      <Footer embedded={embedded} />
    </>
  )
}

export function Stepper({ active, labels }: { active: number; labels: string[] }): JSX.Element {
  return (
    <div className="stepper" aria-label="İlerleme">
      {labels.map((l, i) => (
        <div key={l} className={`step ${i + 1 === active ? 'active' : i + 1 < active ? 'done' : ''}`}>
          {i > 0 && <span className="line" />}
          <span className="dot">{i + 1 < active ? '✓' : i + 1}</span>
          <span className="lbl">{l}</span>
        </div>
      ))}
    </div>
  )
}

export function ModeCard({
  kind,
  icon,
  title,
  text,
  items,
  cta,
  onPick,
  rules,
  disabled,
  recommendLocked,
  bestScore,
  extra,
  locked,
  lockedText,
}: {
  kind: Mode
  icon: ReactNode
  title: string
  text: string
  items: string[]
  cta: string
  onPick: () => void
  rules?: string
  /** Havuz boş: düğme devre dışı (veri eksikliği). */
  disabled?: boolean
  /** kilit ≠ öneri: görünür kilit rozeti ve tıklanabilir öğrenme yönlendirmesi; gönderim kilidi değil. */
  recommendLocked?: boolean
  extra?: ReactNode
  bestScore?: number
  /** T175: kitle kilidi (ör. ziyaretçi) — kart görünür kalır, soluk ve kilit ikonlu; düğme
   *  gönderime değil `onPick` verilen giriş yönlendirmesine gider (gönderim kilidi değil). */
  locked?: boolean
  lockedText?: string
}): JSX.Element {
  return (
    <div
      className={`mode-card ${kind}${recommendLocked ? ' recommend-locked' : ''}${locked ? ' audience-locked' : ''}`}
      data-recommend-locked={recommendLocked ? 'true' : 'false'}
      data-audience-locked={locked ? 'true' : 'false'}
    >
      <div className="ic">{icon}</div>
      {locked ? (
        <p className="mode-lock-hint" role="status">
          <IconLock width={14} height={14} aria-hidden="true" /> {lockedText}
        </p>
      ) : recommendLocked ? (
        <p className="mode-lock-hint" role="status">
          <IconLock width={14} height={14} aria-hidden="true" /> Önce öğrenme modunda okuma sırasını oturtmanız önerilir.
        </p>
      ) : null}
      <h3>{title}</h3>
      <p className="desc">{text}</p>
      <ul>
        {items.map((i) => (
          <li key={i}>
            <span className="ck"><IconCheck /></span>
            {i}
          </li>
        ))}
      </ul>
      {!locked && rules && <p className="mode-rules">{rules}</p>}
      {!locked && extra}
      {!locked && typeof bestScore === 'number' && (
        <p className="mode-rules">
          {bestScore > 0 ? <>En iyi puan: <b>{bestScore}</b></> : 'Henüz denenmedi'}
        </p>
      )}
      <button className={`btn ${kind === 'learn' ? 'green' : kind === 'assessment' ? 'purple' : 'primary'}`} onClick={onPick} disabled={disabled}>
        {cta}
      </button>
    </div>
  )
}
