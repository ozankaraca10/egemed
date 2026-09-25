import { documentLike, locationSearch } from '../platform-dom'
import type { ModalEnv } from '../ui/modal-env'
import { useMemo, useState } from 'react'
import { useStore } from '../core/StoreProvider'
import { poolFor } from '../data/pool'
import { sampleSession, SESSION_SIZE } from '../core/session'
import { sessionSeedFromNow } from './simulation-core'
import { OPACA_BADGES } from '../gamification/catalog'
import { OPACA_RULES } from '../gamification/rules'
import { Footer } from '../ui/chrome'
import { ScreenHeading } from '../ui/ScreenHeading'
import { buildAchievementsModel, earnedFromServer, GamiAchievementsView, GamiProgressPage, GamiServerFrame, gamiLoadingStatus, levelFromServer, serverHasActivity, streakFromServer, type GamiModalEnv, type ServerGamiData } from '@egemed/gami-ui'
import { monthKeyTr, type AchievementsPeriod } from '@egemed/gamification-core'
import { useGami, useLeaderboard } from '../gamification/useGami'
import { useGamiContext } from '../gamification/GamiContext'
import { gamiDemoFrom } from '../gamification/flag'
import { monthlyRewardFor } from '../gamification/rewards'
import { DOMAIN_META, WEAK_DOMAIN_PCT } from '../ui/gami/domainMeta'
import { opacaAvatarOf, opacaGamiIcons } from '../ui/opacaGami'
import type { WeeklyGoal } from '@egemed/gamification-core'

const goalIcon = (id: WeeklyGoal['id']) => {
  if (id === 'weekly-assessments') return opacaGamiIcons.chart({})
  if (id === 'weekly-avg-score') return opacaGamiIcons.checkCircle({ width: 16, height: 16 })
  return opacaGamiIcons.award({ width: 16, height: 16 })
}

/** Başarılarım (tasarım promptu §4). Yalnız oyunlaştırma bayrağı açıkken erişilir. */
function AchievementsBody({ embedded = false, devBuild = false, modalEnv, server }: { embedded?: boolean; devBuild?: boolean; modalEnv?: ModalEnv; server: ServerGamiData | null }) {
  const { dispatch, now } = useStore()
  const demo = gamiDemoFrom(locationSearch(), devBuild)
  const view = useGami(0, demo)
  const [period, setPeriod] = useState<AchievementsPeriod>('last30')
  const week = useLeaderboard('week', 'all', view.now, view.repo)

  const congrats = useMemo(() => {
    if (demo !== 'winner') return null
    const prev = new Date(view.now.getTime() - 31 * 86_400_000)
    const r = monthlyRewardFor(monthKeyTr(prev)) ?? monthlyRewardFor(monthKeyTr(view.now))
    if (!r) return null
    const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
    return { monthName: `${MONTHS[Number(r.month.slice(5, 7)) - 1]} ${r.month.slice(0, 4)}`, title: r.title, sponsor: r.sponsor }
  }, [demo, view.now])
  const earned = server ? earnedFromServer(OPACA_BADGES, server.summary.badges) : view.state.earned
  const model = useMemo(() => buildAchievementsModel({
    now: view.now,
    period,
    attempts: view.state.attempts,
    rules: OPACA_RULES,
    catalog: OPACA_BADGES,
    stats: view.stats,
    earned,
    badgeContext: { now: view.now },
    level: server ? levelFromServer(server.summary.xp, server.summary.level, OPACA_RULES) : view.level,
    streak: server ? streakFromServer(server.summary.streak) : view.streak,
    goals: view.goals,
    profile: view.state.profile,
    weekRows: server?.rows ?? week?.rows ?? null,
    domainMeta: DOMAIN_META,
    weakPct: WEAK_DOMAIN_PCT,
    lockedNote: (id) => (id === 'podium' ? 'Sunucu bağlantısı gelince kazanılabilir (şu an demo sıralama).' : null),
    congrats,
    ...(server ? { activity: serverHasActivity(server.summary, view.state.attempts.length) } : {}),
  }), [congrats, earned, period, server, view, week])
  const study = (key: string) => {
    dispatch({ type: 'setLearnFocus', key })
    dispatch({ type: 'startMode', mode: 'learn' })
    dispatch({ type: 'goto', screen: 'learn' })
  }
  const scrollToBadges = () => documentLike()?.getElementById('gami-badges')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const startAssessment = () => {
    const seed = sessionSeedFromNow(now())
    dispatch({
      type: 'startSession',
      practiceIds: sampleSession(poolFor('practice'), seed, SESSION_SIZE),
      assessmentIds: sampleSession(poolFor('assessment'), seed + 1, SESSION_SIZE),
      seed,
    })
    dispatch({ type: 'startMode', mode: 'assessment' })
  }

  return (
    <>
      <div className="screen">
        <GamiProgressPage active="achievements" demo={server === null} onTab={(id) => dispatch({ type: 'goto', screen: id })} icons={opacaGamiIcons}>
          <GamiAchievementsView
            title={<ScreenHeading className="results-title-v2">Başarılarım</ScreenHeading>}
            subtitle="Değerlendirme ve uygulama oturumlarından kazandığın ilerleme."
            period={model.hasAttempts ? period : null}
            periods={model.periods}
            onPeriod={setPeriod}
            congrats={model.congrats}
            congratsIcon={opacaGamiIcons.award({ width: 28, height: 28 })}
            hasAttempts={model.hasAttempts}
            profile={model.profile}
            avatarOf={opacaAvatarOf}
            onLeaderboard={() => dispatch({ type: 'goto', screen: 'leaderboard' })}
            onAssessment={startAssessment}
            points={model.points}
            rangeLabel={model.rangeLabel}
            goals={model.goals}
            goalIcon={goalIcon}
            doneIcon={opacaGamiIcons.check({ width: 16, height: 16 })}
            weekLabel={model.weekLabel}
            domains={model.domains}
            domainRange={model.domainRange}
            badges={model.badges}
            categories={model.categories}
            onStudy={study}
            onScrollBadges={scrollToBadges}
            {...(modalEnv ? { modalEnv: modalEnv as GamiModalEnv } : {})}
            icons={opacaGamiIcons}
          />
        </GamiProgressPage>
      </div>
      <Footer embedded={embedded} />
    </>
  )
}

export function AchievementsScreen({ embedded = false, devBuild = false, modalEnv }: { embedded?: boolean; devBuild?: boolean; modalEnv?: ModalEnv }) {
  const { gamification } = useGamiContext()
  const body = (server: ServerGamiData | null) => (
    <AchievementsBody devBuild={devBuild} embedded={embedded} server={server} {...(modalEnv ? { modalEnv } : {})} />
  )
  if (gamification === undefined) return body(null)
  return (
    <GamiServerFrame
      cohort="all"
      fallback={gamiLoadingStatus()}
      icon={opacaGamiIcons.info({ width: 16, height: 16 })}
      period="week"
      source={gamification}
    >
      {body}
    </GamiServerFrame>
  )
}
