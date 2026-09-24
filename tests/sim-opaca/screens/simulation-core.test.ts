import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CASE_TIME_SEC,
  caseTimeLimitSec,
  computeQuestionLatency,
  fmtSec,
  hasSimulationProgress,
  patientLine,
  planK3SessionRegeneration,
  planNewPracticeSample,
  planPrimaryAction,
  resolveSimulationSession,
  sessionSeedFromNow,
  sourceNote,
} from '../../../packages/sim-opaca/src/index'
import type { CaseDef, ImageRecord, Question } from '../../../packages/sim-opaca/src/index'

/** Simulation çekirdek grubu — E2 §8 S15 kabulü: saf fonksiyonlar, sentetik fixture. */

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
  const pool = [caseDef({ id: 'c1' }), caseDef({ id: 'c2' }), caseDef({ id: 'c3' })]

  it('resolveSimulationSession oturum kimliklerini vakaya çözümler', () => {
    const resolved = resolveSimulationSession({
      mode: 'practice',
      practiceIds: ['c2', 'c1'],
      assessmentIds: [],
      caseIndex: 1,
      allCases: pool,
      pool,
    })
    expect(resolved.sessionCases.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(resolved.caseList.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(resolved.currentCase?.id).toBe('c1')
  })

  it('resolveSimulationSession boş oturumda havuzdan SESSION_SIZE kadar düşer', () => {
    const resolved = resolveSimulationSession({
      mode: 'practice',
      practiceIds: [],
      assessmentIds: [],
      caseIndex: 0,
      allCases: pool,
      pool,
    })
    expect(resolved.sessionCases).toHaveLength(0)
    expect(resolved.caseList).toHaveLength(3)
    expect(resolved.currentCase?.id).toBe('c1')
  })

  it('planK3SessionRegeneration boş listede deterministik örneklem üretir (K3)', () => {
    const now = () => 1_700_000_000_123
    const plan = planK3SessionRegeneration({
      mode: 'practice',
      sessionCasesCount: 0,
      seed: 42,
      practiceIds: [],
      assessmentIds: ['a_keep'],
      pool,
      now,
    })
    expect(plan).not.toBeNull()
    expect(plan!.seed).toBe(42)
    expect(plan!.practiceIds.length).toBeGreaterThan(0)
    expect(plan!.assessmentIds).toEqual(['a_keep'])

    const again = planK3SessionRegeneration({
      mode: 'practice',
      sessionCasesCount: 0,
      seed: 42,
      practiceIds: [],
      assessmentIds: [],
      pool,
      now,
    })
    expect(again!.practiceIds).toEqual(plan!.practiceIds)
  })

  it('planK3SessionRegeneration learn modunda ve dolu listede null döner', () => {
    expect(
      planK3SessionRegeneration({
        mode: 'learn',
        sessionCasesCount: 0,
        seed: 1,
        practiceIds: [],
        assessmentIds: [],
        pool,
        now: () => 0,
      }),
    ).toBeNull()
    expect(
      planK3SessionRegeneration({
        mode: 'practice',
        sessionCasesCount: 2,
        seed: 1,
        practiceIds: ['c1'],
        assessmentIds: [],
        pool,
        now: () => 0,
      }),
    ).toBeNull()
  })

  it('planK3SessionRegeneration tohum yoksa now ile üretir', () => {
    const plan = planK3SessionRegeneration({
      mode: 'assessment',
      sessionCasesCount: 0,
      seed: 0,
      practiceIds: ['p_keep'],
      assessmentIds: [],
      pool,
      now: () => 2_147_483_647 + 99,
    })
    expect(plan!.seed).toBe(sessionSeedFromNow(2_147_483_647 + 99))
    expect(plan!.practiceIds).toEqual(['p_keep'])
    expect(plan!.assessmentIds.length).toBeGreaterThan(0)
  })

  it('planNewPracticeSample yeni uygulama oturumu planlar', () => {
    const plan = planNewPracticeSample({
      assessmentIds: ['a1'],
      pool,
      now: () => 99_999,
    })
    expect(plan.seed).toBe(sessionSeedFromNow(99_999))
    expect(plan.assessmentIds).toEqual(['a1'])
    expect(plan.practiceIds.length).toBeGreaterThan(0)
  })

  it('sourceNote ve patientLine vaka metinlerini üretir', () => {
    const c = caseDef({
      mappingNote: 'Eğitim eşlemesi notu.',
      patient: { age: null, sex: null },
    })
    expect(patientLine(c)).toBe('Yaşı bilinmeyen hasta.')
    expect(sourceNote(c, 'expert_bbox', syntheticImage)).toContain('nih-cxr14')
    expect(sourceNote(c, 'expert_bbox', syntheticImage)).toContain('Radyolog işaretlemesi')
    expect(sourceNote(c, 'expert_bbox', syntheticImage)).toContain('Eğitim eşlemesi notu.')
    expect(sourceNote(c, undefined, undefined)).toContain('Görüntü kaydı bulunamadı.')
    expect(sourceNote(c, undefined, undefined)).toContain('Ana bulgu etiketi: yok.')
  })

  it('fmtSec dakika:saniye biçiminde ve sınır değerlerde doğru', () => {
    expect(fmtSec(0)).toBe('00:00')
    expect(fmtSec(59)).toBe('00:59')
    expect(fmtSec(60)).toBe('01:00')
    expect(fmtSec(125)).toBe('02:05')
    expect(fmtSec(3599)).toBe('59:59')
  })

  it('computeQuestionLatency gösterim zamanından gecikme hesaplar', () => {
    const qs = [question({ id: 'q1' }), question({ id: 'q2' })]
    expect(computeQuestionLatency(qs, { q1: 1_000 }, 4_500)).toEqual({ q1: 3_500 })
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

  it('hasSimulationProgress ve caseTimeLimitSec yardımcıları', () => {
    expect(hasSimulationProgress({}, 0, 0)).toBe(false)
    expect(hasSimulationProgress({ q1: ['a'] }, 0, 0)).toBe(true)
    expect(caseTimeLimitSec(caseDef(), false)).toBeUndefined()
    expect(caseTimeLimitSec(caseDef(), true)).toBe(120)
    expect(caseTimeLimitSec(caseDef({ timeLimitSec: 90 }), true)).toBe(90)
    const noLimitCase = caseDef()
    delete noLimitCase.timeLimitSec
    expect(caseTimeLimitSec(noLimitCase, true)).toBe(DEFAULT_CASE_TIME_SEC)
  })
})
