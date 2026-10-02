import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EmbeddedProvider } from '../../../packages/sim-opaca/src/EmbeddedContext'
import { DEFAULT_WEIGHTS, MASTERY_THRESHOLD, ResultsScreen, StoreProvider, aggregateResults, createMemoryRuntimeAdapter, encodeMark, initialState, initialTelemetry } from '../../../packages/sim-opaca/src/index'
import { finishWithServerResults, scoredResult } from '../score-fixture'
import type {
  AppState,
  CaseDef,
  CaseResult,
  ImageRecord,
  Question,
  ReadingZone,
  StoragePort,
  Telemetry,
  WindowLike,
  ZoneVisit,
} from '../../../packages/sim-opaca/src/index'

/** ResultsScreen — E2 §8 S17 kabulü: alan bazlı sonuçlar, başarı eşiği (80), bestScore
 *  StoragePort üzerinden; `opaca.gami.v1` / öğrenci adı yazılmaz (§7.1 KVKK). */

const GAMI_STORAGE_KEY = 'opaca.gami.v1'

const inertWindow: WindowLike = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
  visibilityState: 'visible',
}

function trackingStorage(seed: Record<string, string> = {}): StoragePort & { entries: Map<string, string> } {
  const entries = new Map(Object.entries(seed))
  return {
    entries,
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
  }
}

function renderResults(
  prepared: AppState,
  storage = trackingStorage(),
  props: { gamiEnabled?: boolean; gami?: { recordSessionResults: ReturnType<typeof vi.fn> }; embedded?: boolean } = {}
): { html: string; storage: StoragePort & { entries: Map<string, string> } } {
  const html = renderToStaticMarkup(
    createElement(
      StoreProvider,
      {
        initialState: prepared,
        env: inertWindow,
        now: () => 1_728_000_000_000,
        runtime: createMemoryRuntimeAdapter(),
        storage,
        children: createElement(ResultsScreen, props),
      }
    )
  )
  return { html, storage }
}

const img = (): ImageRecord => ({
  id: 'res_fixture_img',
  sourceDataset: 'nih-cxr14',
  sourceFile: 't.png',
  viewPosition: 'PA',
  ageYears: 50,
  sex: 'F',
  population: 'yetiskin',
  width: 1000,
  height: 1000,
  originalWidth: 1000,
  originalHeight: 1000,
  findings: { pneumothorax: 'expert_bbox' },
  negatives: {},
  annotations: [{ finding: 'pneumothorax', source: 'expert_bbox', x: 0.6, y: 0.1, w: 0.2, h: 0.3 }],
  quality: null,
  runtimeUrl: 'assets/xray/runtime/res_fixture_img.webp',
  bytes: 1,
  validationStatus: 'validated',
  clinicalReview: 'beklemede',
  issues: [],
})

const qChoice: Question = {
  id: 'rq1',
  type: 'finding_identify',
  domain: 'recognition',
  prompt: 'Sentetik bulgu sorusu',
  options: [{ id: 'a', label: 'Pnömotoraks' }, { id: 'b', label: 'Normal' }],
  correct: ['a'],
  feedbackCorrect: '',
  feedbackIncorrect: 'Yanlış',
}

const qMark: Question = {
  id: 'rq2',
  type: 'localization',
  domain: 'localization',
  prompt: 'Sentetik lokalizasyon',
  options: [],
  correct: [],
  targetFinding: 'pneumothorax',
  feedbackCorrect: '',
  feedbackIncorrect: '',
}

const REQUIRED = ['a_trachea', 'b_r_upper', 'c_heart', 'd_r_diaphragm', 'e_bones']

const mkCase = (): CaseDef => ({
  id: 'res_fixture_case',
  title: 'Sentetik sonuç vakası',
  modes: ['practice', 'assessment'],
  population: 'yetiskin',
  patient: { age: 50, sex: 'kadın' },
  chiefComplaint: '',
  history: '',
  vitalSigns: {},
  objectives: [],
  imageId: 'res_fixture_img',
  primaryFinding: 'pneumothorax',
  clinicalDiagnosis: null,
  mappingValidation: 'validated',
  technique: { requiredZones: REQUIRED, minDwellMs: 500, systematicOrder: true },
  questions: [qChoice, qMark],
  feedback: { summary: '' },
  references: [],
  scoringWeights: { ...DEFAULT_WEIGHTS, diagnosis: 0, interpretation: 0, recognition: 50 },
})

const ZONES: ReadingZone[] = [
  { id: 'a_trachea', step: 'A', label: 'Trakea', fullLabel: 'A — Trakea', detail: '', rects: [] },
  { id: 'b_r_upper', step: 'B', label: 'Sağ üst zon', fullLabel: 'B — Sağ üst zon', detail: '', rects: [] },
  { id: 'c_heart', step: 'C', label: 'Kalp', fullLabel: 'C — Kalp', detail: '', rects: [] },
  { id: 'd_r_diaphragm', step: 'D', label: 'Sağ diyafram', fullLabel: 'D — Sağ diyafram', detail: '', rects: [] },
  { id: 'e_bones', step: 'E', label: 'Kemik', fullLabel: 'E — Kemik', detail: '', rects: [] },
]

const tele = (order: string[], dwell = 1000): Telemetry => ({
  visits: Object.fromEntries(
    order.map((id, i): [string, ZoneVisit] => [id, { dwellMs: dwell, visits: 1, firstOrder: i }])
  ),
  order,
  toolUse: { zoom: 0, window: 0, invert: 0, overlay: 0, measure: 0 },
})

function highResult(): CaseResult {
  const c = mkCase()
  const allRight = { rq1: ['a'], rq2: [encodeMark({ x: 0.7, y: 0.2 })] }
  return scoredResult(c, allRight, tele(REQUIRED), 0, img(), ZONES)
}

function lowResult(): CaseResult {
  return scoredResult(mkCase(), {}, initialTelemetry(), 0, img(), ZONES)
}

function preparedState(results: CaseResult[], mode: 'practice' | 'assessment'): AppState {
  return finishWithServerResults({ ...initialState, screen: 'simulation', assessmentTimer: 125_000 }, mode, results)
}

describe('ResultsScreen (statik render)', () => {

  it('başarı eşiği 80: yüksek puan Başarılı, düşük puan Hedefin altında', () => {
    const passHtml = renderResults(preparedState([highResult()], 'assessment')).html
    expect(passHtml).toContain('Değerlendirme Tamamlandı')
    expect(passHtml).toContain('Başarılı')
    expect(passHtml).toContain('Durum (eşik 80)')
    expect(aggregateResults([highResult()]).mastery).toBe(true)
    expect(MASTERY_THRESHOLD).toBe(80)

    const failHtml = renderResults(preparedState([lowResult()], 'practice')).html
    expect(failHtml).toContain('Vaka Raporu')
    expect(failHtml).toContain('Hedefin altında')
    expect(aggregateResults([lowResult()]).mastery).toBe(false)
  })

  it('karşılaşmada "Karşılaşma sonucunu gör" eylemi çizilir; tekrar dene gizlenir', () => {
    const prepared: AppState = { ...preparedState([highResult()], 'assessment'), serverChallengeId: 'ch-1' }
    const html = renderToStaticMarkup(
      createElement(StoreProvider, {
        initialState: prepared,
        env: inertWindow,
        now: () => 1_728_000_000_000,
        runtime: createMemoryRuntimeAdapter(),
        storage: trackingStorage(),
        children: createElement(EmbeddedProvider, {
          embedded: true,
          challengeId: 'ch-1',
          onChallengeFinished: () => undefined,
          children: createElement(ResultsScreen, { embedded: true }),
        }),
      })
    )
    expect(html).toContain('Karşılaşma sonucunu gör')
    expect(html).not.toContain('Tekrar dene')
  })
})

describe('KVKK: öğrenci adı depolama yolu kesilir', () => {
  it('sonuç ekranı render sonrası opaca.gami.v1 yazmaz ve depoda görünen ad tutmaz', () => {
    const storage = trackingStorage()
    renderResults(preparedState([highResult(), lowResult()], 'assessment'), storage, {
      gamiEnabled: true,
      gami: { recordSessionResults: vi.fn() },
    })
    expect(storage.entries.has(GAMI_STORAGE_KEY)).toBe(false)
    for (const value of storage.entries.values()) {
      expect(value).not.toMatch(/displayName|learner_name|Öğrenci Adı/i)
    }
  })

  it('gamiEnabled kapalıyken oyunlaştırma seam çağrılmaz', () => {
    const gami = { recordSessionResults: vi.fn() }
    renderResults(preparedState([highResult()], 'practice'), trackingStorage(), { gamiEnabled: false, gami })
    expect(gami.recordSessionResults).not.toHaveBeenCalled()
  })
})
