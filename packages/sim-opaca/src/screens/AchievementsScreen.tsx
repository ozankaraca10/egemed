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
import { GamiAchievementsView, GamiProgressPage, type GamiModalEnv } from '@egemed/gami-ui'
import { buildChartSeries, trShortDate } from '@egemed/gamification-core'
import { badgeViews, sortBadgeViews } from '@egemed/gamification-core'
import { useGami, useLeaderboard } from '../gamification/useGami'
import { gamiDemoFrom } from '../gamification/flag'
import { monthlyRewardFor } from '../gamification/rewards'
import { monthKeyTr } from '@egemed/gamification-core'
import { achievementsRangeTr, type AchievementsPeriod } from '@egemed/gamification-core'
import { DOMAIN_META, WEAK_DOMAIN_PCT } from '../ui/gami/domainMeta'
import { OPACA_BADGE_CATEGORIES, opacaAvatarOf, opacaGamiIcons, toGamiBadge } from '../ui/opacaGami'
import type { WeeklyGoal } from '@egemed/gamification-core'

const PERIODS: { id: AchievementsPeriod; label: string; short: string }[] = [
  { id: 'last30', label: 'Son 30 gün', short: 'son 30 gün' },
  { id: 'last12w', label: 'Son 12 hafta', short: 'son 12 hafta' },
  { id: 'academic', label: 'Akademik yıl', short: 'akademik yıl' },
]

const goalIcon = (id: WeeklyGoal['id']) => {
  if (id === 'weekly-assessments') return opacaGamiIcons.chart({})
  if (id === 'weekly-avg-score') return opacaGamiIcons.checkCircle({ width: 16, height: 16 })
  return opacaGamiIcons.award({ width: 16, height: 16 })
}

/** Başarılarım (tasarım promptu §4). Yalnız oyunlaştırma bayrağı açıkken erişilir. */
export function AchievementsScreen({ embedded = false, devBuild = false, modalEnv }: { embedded?: boolean; devBuild?: boolean; modalEnv?: ModalEnv }) {
  const { dispatch, now } = useStore()
  const demo = gamiDemoFrom(locationSearch(), devBuild)
  const view = useGami(0, demo)
  const [period, setPeriod] = useState<AchievementsPeriod>('last30')
  const week = useLeaderboard('week', 'all', view.now, view.repo)

  const range = useMemo(() => {
    const { start, end } = achievementsRangeTr(period, view.now)
    return { s: start.toISOString(), e: end.toISOString() }
  }, [period, view.now])
  const inPeriod = useMemo(() => view.state.attempts.filter((a) => a.finishedAt >= range.s && a.finishedAt <= range.e), [range, view])
  const points = useMemo(() => buildChartSeries(view.state.attempts, range.s, range.e, OPACA_RULES), [range, view])
  const rangeLabel = `${trShortDate(range.s)} – ${trShortDate(range.e)}`
  const weekStart = view.goals.weekStartTr.toISOString()
  const weekLabel = `${trShortDate(weekStart)} – ${trShortDate(new Date(view.goals.weekStartTr.getTime() + 6 * 86_400_000).toISOString())}`
  const assessments = inPeriod.filter((a) => a.mode === 'assessment')
  const practiceCases = inPeriod.filter((a) => a.mode === 'practice').reduce((n, a) => n + a.caseCount, 0)
  const avg = assessments.length ? assessments.reduce((n, a) => n + a.score, 0) / assessments.length : null
  const periodShort = PERIODS.find((p) => p.id === period)!.short

  const congrats = useMemo(() => {
    if (demo !== 'winner') return null
    const prev = new Date(view.now.getTime() - 31 * 86_400_000)
    const r = monthlyRewardFor(monthKeyTr(prev)) ?? monthlyRewardFor(monthKeyTr(view.now))
    if (!r) return null
    const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
    return { monthName: `${MONTHS[Number(r.month.slice(5, 7)) - 1]} ${r.month.slice(0, 4)}`, title: r.title, sponsor: r.sponsor }
  }, [demo, view.now])
  const badges = useMemo(
    () => sortBadgeViews(badgeViews(OPACA_BADGES, view.stats, view.state.earned, { now: view.now })).map(toGamiBadge),
    [view],
  )
  const domains = DOMAIN_META.map((d) => {
    const vals = assessments.map((a) => a.domains[d.key]).filter((v): v is number => typeof v === 'number')
    const pct = vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null
    return pct === null ? null : { key: d.key, label: d.label, icon: d.icon, pct, weak: pct < WEAK_DOMAIN_PCT }
  }).filter((r): r is NonNullable<typeof r> => r !== null)
  const me = week?.rows.find((r) => r.isMe)
  const ranked = week?.rows.filter((r) => r.rank !== null).length ?? 0
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
        <GamiProgressPage active="achievements" onTab={(id) => dispatch({ type: 'goto', screen: id })} icons={opacaGamiIcons}>
          <GamiAchievementsView
            title={<ScreenHeading className="results-title-v2">Başarılarım</ScreenHeading>}
            subtitle="Değerlendirme ve uygulama oturumlarından kazandığın ilerleme."
            period={view.hasAttempts ? period : null}
            periods={PERIODS}
            onPeriod={setPeriod}
            congrats={congrats}
            congratsIcon={opacaGamiIcons.award({ width: 28, height: 28 })}
            hasAttempts={view.hasAttempts}
            profile={view.hasAttempts ? {
              level: view.level.level,
              xpInto: view.level.xpIntoLevel,
              xpSpan: view.level.levelEndXp - view.level.levelStartXp,
              xpToNext: view.level.xpToNext,
              avatarId: 'me',
              avatarName: view.state.profile.public ? view.state.profile.displayName ?? 'Sen' : null,
              streakCurrent: view.streak.current,
              streakLongest: view.streak.longest,
              periodAssessments: assessments.length,
              periodPractice: practiceCases,
              periodAvg: avg,
              periodLabel: periodShort,
              weekRank: me?.rank ?? null,
              weekRanked: ranked,
            } : null}
            avatarOf={opacaAvatarOf}
            onLeaderboard={() => dispatch({ type: 'goto', screen: 'leaderboard' })}
            onAssessment={startAssessment}
            points={points}
            rangeLabel={rangeLabel}
            goals={view.goals.goals}
            goalIcon={goalIcon}
            doneIcon={opacaGamiIcons.check({ width: 16, height: 16 })}
            weekLabel={weekLabel}
            domains={domains}
            domainRange={`Değerlendirme · ${periodShort}`}
            badges={badges}
            categories={OPACA_BADGE_CATEGORIES}
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
