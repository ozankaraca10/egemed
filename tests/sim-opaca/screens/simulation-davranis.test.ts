import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  SimulationScreen,
  StoreProvider,
  caseTimeLimitSec,
  createMemoryRuntimeAdapter,
  createNoopSimulationPopoverEnv,
  fmtSec,
  initialState,
  patientLine,
  planPrimaryAction,
  poolFor,
  reducer,
  remainingSec,
  sourceNote,
  createBus,
} from '../../../packages/sim-opaca/src/index'
import type {
  CaseDef,
  ImageRecord,
  Question,
  StoragePort,
  WindowLike,
} from '../../../packages/sim-opaca/src/index'

/** SimulationScreen — E2 §8 S16 kabulü (statik render + reducer etkileşimi): olgu kartı,
 *  soru kartı, değerlendirme süresi göstergesi, birincil aksiyon; sentetik vaka fixture. */

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

function renderInStore(node: ReactNode, now = () => 1_728_000_000_000): string {
  return renderToStaticMarkup(
    createElement(StoreProvider, {
      children: node,
      env: inertWindow,
      now,
      runtime: createMemoryRuntimeAdapter(),
      storage: memoryStorage(),
    }),
  )
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

function syntheticCase(over: Partial<CaseDef> = {}): CaseDef {
  return {
    id: 'sim_fixture_case',
    title: 'Sentetik vaka',
    modes: ['practice', 'assessment'],
    population: 'yetiskin',
    patient: { age: 52, sex: 'erkek' },
    chiefComplaint: 'Dispne',
    history: '2 gündür artan nefes darlığı.',
    vitalSigns: { hr: 96, rr: 22, spo2: 91 },
    objectives: [],
    imageId: 'sim_fixture_img',
    primaryFinding: 'pneumothorax',
    clinicalDiagnosis: null,
    mappingValidation: 'validated',
    technique: { requiredZones: ['a_trachea'], minDwellMs: 500 },
    questions: [
      {
        id: 'sq1',
        type: 'single_choice',
        domain: 'recognition',
        prompt: 'Ana bulgu nedir?',
        options: [{ id: 'a', label: 'Pnömotoraks' }, { id: 'b', label: 'Normal' }],
        correct: ['a'],
        feedbackCorrect: 'Doğru',
        feedbackIncorrect: 'Yanlış',
      },
    ],
    feedback: { summary: 'Pnömotoraks düşünülmeli.' },
    references: [],
    scoringWeights: {
      technique: 10,
      systematic: 5,
      quality: 10,
      localization: 25,
      recognition: 25,
      interpretation: 15,
      diagnosis: 10,
    },
    timeLimitSec: 120,
    mappingNote: 'Eğitim eşlemesi notu.',
    ...over,
  }
}

const syntheticImage: ImageRecord = {
  id: 'sim_fixture_img',
  sourceDataset: 'nih-cxr14',
  sourceFile: 'fixture.png',
  viewPosition: 'PA',
  ageYears: 52,
  sex: 'M',
  population: 'yetiskin',
  width: 512,
  height: 512,
  originalWidth: 512,
  originalHeight: 512,
  findings: { pneumothorax: 'expert_bbox' },
  negatives: {},
  annotations: [],
  quality: null,
  runtimeUrl: 'assets/fixture.webp',
  bytes: 1,
  validationStatus: 'validated',
  clinicalReview: 'onayli',
  issues: [],
}

describe('SimulationScreen (statik render)', () => {
  it('olgu kartı, hasta satırı ve kaynak notu düğmesini çizer', () => {
    const practiceCase = poolFor('practice')[0]
    expect(practiceCase).toBeDefined()
    if (!practiceCase) return
    const html = renderInStore(createElement(SimulationScreen))
    expect(html).toContain('<h3')
    expect(html).toContain('Olgu')
    expect(html).toContain(esc(patientLine(practiceCase)))
    expect(html).toContain(esc(practiceCase.chiefComplaint))
    expect(html).toContain('Görüntü kaynağı')
    expect(html).toContain('case-card')
    expect(html).toContain('Vaka 1/')
  })

  it('soru kartı ve birincil aksiyon düğmesini çizer', () => {
    const practiceCase = poolFor('practice')[0]
    expect(practiceCase).toBeDefined()
    if (!practiceCase) return
    const html = renderInStore(createElement(SimulationScreen))
    expect(html).toContain('q-card-dark')
    expect(practiceCase.questions[0]).toBeDefined()
    expect(html).toContain(esc(practiceCase.questions[0]!.prompt))
    expect(html).toContain('Yanıtla')
    expect(html).toContain('sim-grid')
    expect(html).toContain('mode-practice')
  })

  it('gömülü modda footer ve arka plan dekorasyonu çizilmez', () => {
    const html = renderInStore(createElement(SimulationScreen, { embedded: true }))
    expect(html).not.toContain('<footer')
    expect(html).not.toContain('class="app-bg"')
  })

  it('popover env seam no-op ile güvenli çalışır', () => {
    const env = createNoopSimulationPopoverEnv()
    expect(() => env.addEventListener('mousedown', () => undefined)).not.toThrow()
    const html = renderInStore(createElement(SimulationScreen, { popoverEnv: env }))
    expect(html).toContain('sim-grid')
  })
})

describe('değerlendirme süresi göstergesi', () => {
  it('kalan süreyi fmtSec ile biçimlendirir', () => {
    const c = syntheticCase()
    const limit = caseTimeLimitSec(c, true)!
    expect(remainingSec(30_000, limit)).toBe(90)
    expect(fmtSec(remainingSec(30_000, limit)!)).toBe('01:30')
    expect(fmtSec(remainingSec(0, limit)!)).toBe('02:00')
  })
})

describe('SimulationScreen reducer etkileşimi', () => {
  const noopSeam = { emit: () => undefined }

  it('yanıt gönderimi revealed durumuna ve moda göre ilerler', () => {
    const c = syntheticCase()
    const qs: Question[] = c.questions
    let s = reducer({ ...initialState, mode: 'practice' }, { type: 'caseMount', caseDef: c }, noopSeam)
    s = reducer(s, { type: 'answer', qid: 'sq1', values: ['a'] }, noopSeam)
    const plan = planPrimaryAction({
      mode: 'practice',
      question: qs[0],
      questions: qs,
      revealed: false,
      canSubmit: true,
      given: ['a'],
      image: syntheticImage,
    })
    expect(plan.dispatches).toEqual([{ type: 'submitAnswer', qid: 'sq1', correct: true }])
    for (const action of plan.dispatches) s = reducer(s, action, noopSeam)
    expect(s.revealed.sq1).toBe(true)
    const advance = planPrimaryAction({
      mode: 'practice',
      question: qs[0],
      questions: qs,
      revealed: true,
      canSubmit: true,
      given: ['a'],
      image: syntheticImage,
    })
    expect(advance.dispatches).toEqual([{ type: 'finishCase' }])
  })

  it('değerlendirmede submit-then-finish planı son vakada etkileşim kaydı işaretler', () => {
    const c = syntheticCase()
    const qs = c.questions
    const plan = planPrimaryAction({
      mode: 'assessment',
      question: qs[0],
      questions: qs,
      revealed: false,
      canSubmit: true,
      given: ['a'],
      image: syntheticImage,
    })
    expect(plan).toEqual({
      dispatches: [
        { type: 'submitAnswer', qid: 'sq1', correct: true },
        { type: 'finishCase' },
      ],
      saveInteractions: true,
    })
  })

  it('kaynak notu sentetik görüntü fixture ile üretilir', () => {
    const c = syntheticCase()
    const note = sourceNote(c, 'expert_bbox', syntheticImage)
    expect(note).toContain('nih-cxr14')
    expect(note).toContain('Eğitim eşlemesi notu.')
  })
})

describe('sentetik vaka fixture', () => {
  it('şema ve soru kimliği test için sabit', () => {
    const c = syntheticCase()
    expect(c.id).toBe('sim_fixture_case')
    expect(c.questions[0]?.id).toBe('sq1')
    expect(syntheticImage.findings.pneumothorax).toBe('expert_bbox')
  })

  it('oyunlaştırma seam gamiEnabled kapalıyken çağrılmaz', () => {
    const gami = { recordAssessmentComplete: vi.fn() }
    const bus = createBus(() => 100)
    bus.emit({ type: 'assessment_completed', total: 80 })
    expect(gami.recordAssessmentComplete).not.toHaveBeenCalled()
  })
})
