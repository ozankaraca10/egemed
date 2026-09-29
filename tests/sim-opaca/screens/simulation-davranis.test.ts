import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmbeddedProvider } from '../../../packages/sim-opaca/src/EmbeddedContext'
import { SimulationScreen, StoreProvider, createMemoryRuntimeAdapter, initialState, reducer, type AppState } from '../../../packages/sim-opaca/src/index'
import type { StoragePort, WindowLike } from '../../../packages/sim-opaca/src/index'
import { fakeSessions, publicCase, caseResult } from '../session-fixture'
import { fromServerResult, toClientCase } from '../../../packages/sim-opaca/src/index'

/** SimulationScreen — E2 §8 S16 kabulü. A2.3 (ADR-009): ekran yalnız sunucu
 *  oturumuyla çizilir; oturum kanalı yoksa uygulama/değerlendirme açılmaz. */

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const imageUrl = (id: string, token: string) => `/api/sims/opaca/sessions/${id}/image/${token}`
const clientCase = toClientCase(publicCase(1), 'practice', SESSION_ID, imageUrl)

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: 'visible',
}

function memoryStorage(): StoragePort {
  const entries = new Map<string, string>()
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
  }
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

function serverState(mode: 'practice' | 'assessment' = 'practice', perCaseLimitMs: number | null = null): AppState {
  let s: AppState = { ...initialState, mode, screen: 'simulation' }
  s = reducer(s, { type: 'serverStarted', sessionId: SESSION_ID, mode, caseCount: 2, perCaseLimitMs })
  s = reducer(s, { type: 'serverCaseLoaded', index: 1, clientCase })
  return s
}

function renderInStore(node: ReactNode, state: AppState, withSessions = true, now = () => 1_728_000_000_000): string {
  const tree = withSessions
    ? createElement(EmbeddedProvider, { embedded: true, sessions: fakeSessions({ mode: state.mode === 'assessment' ? 'assessment' : 'practice' }), children: node })
    : node
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: tree,
      env: inertWindow,
      now,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
      initialState: state,
    }),
  )
}

describe('SimulationScreen (sunucu durumuyla statik render)', () => {

  it('soru kartını ve birincil aksiyonu çizer', () => {
    const html = renderInStore(createElement(SimulationScreen), serverState())
    expect(html).toContain('q-card-dark')
    expect(html).toContain(esc(clientCase.questions[0]!.prompt))
    expect(html).toContain('Yanıtla')
    expect(html).toContain('sim-grid')
    expect(html).toContain('mode-practice')
  })

  it('değerlendirmede katı mod şeridi ve sunucu süre sınırı görünür', () => {
    const state = serverState('assessment', 600_000)
    const html = renderInStore(createElement(SimulationScreen), state)
    expect(html).toContain('Değerlendirme.')
    expect(html).toContain('mode-assessment')
    expect(html).toContain('10:00')
    expect(html).toContain('is-strict')
  })

  it('vaka sonu kartı sunucu meta verisiyle çizilir (uygulama)', () => {
    let s = serverState()
    s = reducer(s, { type: 'serverCaseResult', result: { ...fromServerResult(caseResult(1)).result, caseId: 'srv-1' }, meta: { title: 'Gerçek Vaka Başlığı 1', diagnosis: 'Pnömotoraks', summary: 'Sağ hemitoraksta pnömotoraks.' } })
    const html = renderInStore(createElement(SimulationScreen), s)
    expect(html).toContain('Vaka 1 / 2 tamamlandı')
    expect(html).toContain('Tanı: Pnömotoraks')
    expect(html).toContain('Sağ hemitoraksta pnömotoraks.')
    expect(html).toContain('Sonraki vaka')
  })
})

describe('oturum kanalı yokken', () => {
  it('uygulama/değerlendirme "sunucu bağlantısı gerekir" gösterir', () => {
    const html = renderInStore(createElement(SimulationScreen), serverState(), false)
    expect(html).toContain('Bu mod için sunucu bağlantısı gerekir')
    expect(html).not.toContain('q-card-dark')
    expect(html).not.toContain('Olgu')
  })
})

describe('sunucu durumu yardımcıları', () => {
  const noopSeam = { emit: () => undefined }

  it('ipucu ve kontrol geri bildirimi sunucu durumunda tutulur', () => {
    let s = serverState()
    s = reducer(s, { type: 'serverHint', qid: 'q1', hint: 'İpucu q1' }, noopSeam)
    s = reducer(s, { type: 'serverChecked', qid: 'q1', feedback: { correct: false, correctOptionIds: ['opt-a-1000'], feedback: 'Yanlış.' } }, noopSeam)
    expect(s.server?.hints.q1).toBe('İpucu q1')
    expect(s.server?.feedback.q1?.correct).toBe(false)
  })
})
