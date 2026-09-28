import { describe, expect, it } from 'vitest'
import {
  fmtSec,
  hasSimulationProgress,
  patientLine,
  planPrimaryAction,
} from '../../../packages/sim-opaca/src/index'
import type { CaseDef, ImageRecord, Question } from '../../../packages/sim-opaca/src/index'

/** Simulation çekirdek grubu — E2 §8 S15 kabulü: saf fonksiyonlar, sentetik fixture.
 *  A2.3 (ADR-009): oturum/örneklem çözümleme sunucuya taşındı; burada yalnız
 *  ekranların kullandığı DOM'suz yardımcılar doğrulanır. */

function caseDef(over: Partial<CaseDef> = {}): CaseDef {
  return {
    id: 'c_fixture',
    title: 'Fixture vaka',
    modes: ['practice', 'assessment'],
    population: 'yetiskin',
    patient: { age: 45, sex: 'kadın' },
    chiefComplaint: 'Öksürük',
    history: '3 gündür devam ediyor.',
    vitalSigns: { hr: 88, rr: 18, spo2: 96 },
    objectives: [],
    imageId: 'img_fixture',
    primaryFinding: 'nodule',
    clinicalDiagnosis: null,
    mappingValidation: 'validated',
    technique: { requiredZones: [], minDwellMs: 500 },
    questions: [],
    feedback: { summary: 'Özet' },
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
    ...over,
  }
}

function question(over: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    type: 'single_choice',
    domain: 'recognition',
    prompt: 'Ana bulgu?',
    options: [{ id: 'a', label: 'Nodül' }, { id: 'b', label: 'Normal' }],
    correct: ['a'],
    feedbackCorrect: 'Doğru',
    feedbackIncorrect: 'Yanlış',
    ...over,
  }
}

const syntheticImage: ImageRecord = {
  id: 'img_fixture',
  sourceDataset: 'nih-cxr14',
  sourceFile: 'fixture.png',
  viewPosition: 'PA',
  ageYears: 45,
  sex: 'F',
  population: 'yetiskin',
  width: 512,
  height: 512,
  originalWidth: 512,
  originalHeight: 512,
  findings: { nodule: 'expert_bbox' },
  negatives: {},
  annotations: [],
  quality: null,
  runtimeUrl: 'assets/fixture.webp',
  bytes: 1,
  validationStatus: 'validated',
  clinicalReview: 'onayli',
  issues: [],
}

describe('simulation-core (S15 saf çekirdek)', () => {
  it('patientLine vaka metnini üretir', () => {
    expect(patientLine(caseDef())).toBe('45 yaşında kadın hasta.')
    expect(patientLine(caseDef({ patient: { age: null, sex: null } }))).toBe('Yaşı bilinmeyen hasta.')
  })

  it('fmtSec dakika:saniye biçiminde ve sınır değerlerde doğru', () => {
    expect(fmtSec(0)).toBe('00:00')
    expect(fmtSec(59)).toBe('00:59')
    expect(fmtSec(60)).toBe('01:00')
    expect(fmtSec(125)).toBe('02:05')
    expect(fmtSec(3599)).toBe('59:59')
  })

  it('planPrimaryAction uygulama modunda revealed sonrası ilerler', () => {
    const qs = [question({ id: 'q1' }), question({ id: 'q2' })]
    expect(
      planPrimaryAction({
        mode: 'practice',
        question: qs[0],
        questions: qs,
        revealed: true,
        canSubmit: true,
        given: ['a'],
        image: syntheticImage,
      }).dispatches,
    ).toEqual([{ type: 'advance' }])
    expect(
      planPrimaryAction({
        mode: 'practice',
        question: qs[1],
        questions: qs,
        revealed: true,
        canSubmit: true,
        given: ['a'],
        image: syntheticImage,
      }),
    ).toEqual({ dispatches: [{ type: 'finishCase' }], saveInteractions: false })
  })

  it('planPrimaryAction değerlendirmede submit-then-advance/finish planlar', () => {
    const qs = [question({ id: 'q1' }), question({ id: 'q2' })]
    const mid = planPrimaryAction({
      mode: 'assessment',
      question: qs[0],
      questions: qs,
      revealed: false,
      canSubmit: true,
      given: ['a'],
      image: syntheticImage,
    })
    expect(mid.dispatches).toEqual([
      { type: 'submitAnswer', qid: 'q1', correct: true },
      { type: 'advance' },
    ])
    expect(mid.saveInteractions).toBe(false)

    const last = planPrimaryAction({
      mode: 'assessment',
      question: qs[1],
      questions: qs,
      revealed: false,
      canSubmit: true,
      given: ['a'],
      image: syntheticImage,
    })
    expect(last.dispatches).toEqual([
      { type: 'submitAnswer', qid: 'q2', correct: true },
      { type: 'finishCase' },
    ])
    expect(last.saveInteractions).toBe(true)
  })

  it('planPrimaryAction yanıt yoksa boş plan döner', () => {
    expect(
      planPrimaryAction({
        mode: 'assessment',
        question: question(),
        questions: [question()],
        revealed: false,
        canSubmit: false,
        given: [],
        image: syntheticImage,
      }).dispatches,
    ).toEqual([])
  })

  it('hasSimulationProgress ilerleme işaretlerini sayar', () => {
    expect(hasSimulationProgress({}, 0, 0)).toBe(false)
    expect(hasSimulationProgress({ q1: ['a'] }, 0, 0)).toBe(true)
    expect(hasSimulationProgress({}, 1, 0)).toBe(true)
    expect(hasSimulationProgress({}, 0, 1)).toBe(true)
  })
})
