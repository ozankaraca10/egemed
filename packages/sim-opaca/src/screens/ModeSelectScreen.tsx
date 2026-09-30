import type { JSX, ReactNode } from 'react'
import type { SimAudience } from '@egemed/sim-host'
import { audienceCanUseMode, VISITOR_LOCK_TEXT } from '@egemed/sim-host'
import { useLearnGate, useStartMode } from '../core/LearnGate'
import { modeLearnLocked, modePickTarget } from '../core/flow'
import { useStore } from '../core/StoreProvider'
import { useGamiContext } from '../gamification/GamiContext'
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
  const isVisitor = audience === 'visitor'
  const isFaculty = audience === 'faculty'
  const gate = useLearnGate()
  const startMode = useStartMode()
  // T253a: "ayın ödülü" satırı yalnız kabuk kanalında geçerli ödül varsa çizilir.
  const { rewardsSnapshot } = useGamiContext()
  const monthlyReward = rewardsSnapshot?.current ?? null
  // Ziyaretçi kilidi gönderim kilidi değildir: kart pasifleşmez, düğme girişe yönlendirir.
  const canPractice = audienceCanUseMode(audience, 'practice')
  const canAssessment = audienceCanUseMode(audience, 'assessment')
  // A2.3: uygulama/değerlendirme vakaları yalnız sunucu oturumundan gelir; kanal yoksa kapalı.
  const serverReady = useSessions() !== undefined
  // T218: öğrenme tamamlanmadan uygulama/değerlendirme KİLİTLİDİR (öneri değil);
  // kart pasifleşir ve istek öğrenme ekranına düşer (tek koruma: `canStartMode`).
  const practiceLocked = modeLearnLocked(gate.complete, practiceCount > 0)
  const assessmentLocked = modeLearnLocked(gate.complete, assessmentCount > 0)
  const signIn = () => requestSignIn?.()
  const pick = (mode: Mode) => {
    const poolReady = mode === 'practice' ? practiceCount > 0 : mode === 'assessment' ? assessmentCount > 0 : true
    const target = modePickTarget(mode, gate.complete, poolReady)
    startMode(target)
    if (target === 'learn') dispatch({ type: 'goto', screen: 'learn' })
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
              cta={!canPractice ? VISITOR_LOCK_TEXT.cta : practiceLocked ? 'Öğrenmeye git' : 'Vakaları çöz'}
              disabled={canPractice && (practiceLocked || !practiceCount || !serverReady)}
              learnLocked={canPractice && practiceLocked}
              lockText={gate.lockText}
              locked={!canPractice}
              lockedText={VISITOR_LOCK_TEXT.modeLocked}
              onPick={!canPractice ? signIn : () => pick('practice')}
              bestScore={state.bestScore.practice}
            />
            <ModeCard
              kind="assessment"
              icon={<IconChart />}
              title="Değerlendirme Modu"
              text={assessmentCount ? `${assessmentCount} radyolog etiketli vakalık havuzdan rastgele ${Math.min(SESSION_SIZE, assessmentCount)} vaka.` : 'Değerlendirme havuzu boş: radyolog etiketli veri seti içe aktarılmalı.'}
              items={['Okuma bölgesi ve uzman katmanı yok', 'Vaka başına süre sınırı', embedded ? 'Puan kaydedilir' : 'SCORM puanı']}
              rules="İpucu yok · geri bildirim yalnız sonunda · puan kaydedilir"
              cta={!canAssessment ? VISITOR_LOCK_TEXT.cta : assessmentLocked ? 'Öğrenmeye git' : 'Değerlendirmeye gir'}
              disabled={canAssessment && (assessmentLocked || !assessmentCount || !serverReady)}
              learnLocked={canAssessment && assessmentLocked}
              lockText={gate.lockText}
              locked={!canAssessment}
              lockedText={VISITOR_LOCK_TEXT.modeLocked}
              onPick={!canAssessment ? signIn : () => pick('assessment')}
              bestScore={state.bestScore.assessment}
              extra={gamiEnabled && monthlyReward ? (
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
  bestScore,
  extra,
  locked,
  lockedText,
  learnLocked,
  lockText,
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
  extra?: ReactNode
  bestScore?: number
  /** T175: kitle kilidi (ör. ziyaretçi) — kart görünür kalır, soluk ve kilit ikonlu; düğme
   *  gönderime değil `onPick` verilen giriş yönlendirmesine gider (gönderim kilidi değil). */
  locked?: boolean
  lockedText?: string
  /** T218: öğrenme tamamlanmadı — kart kilit ikonu ve ilerleme metniyle işaretlenir,
   *  düğme gönderime kapalıdır (`disabled`); ziyaretçi kilidi önceliklidir. */
  learnLocked?: boolean
  /** Kilit metni: "Önce öğrenme modunu tamamlayın: X/Y konu açıldı." */
  lockText?: string
}): JSX.Element {
  return (
    <div
      className={`mode-card ${kind}${learnLocked ? ' learn-locked' : ''}${locked ? ' audience-locked' : ''}`}
      data-learn-locked={learnLocked ? 'true' : 'false'}
      data-audience-locked={locked ? 'true' : 'false'}
    >
      <div className="ic">{icon}</div>
      {locked ? (
        <p className="mode-lock-hint" role="status">
          <IconLock width={14} height={14} aria-hidden="true" /> {lockedText}
        </p>
      ) : learnLocked ? (
        <p className="mode-lock-hint" role="status">
          <IconLock width={14} height={14} aria-hidden="true" /> {lockText}
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
