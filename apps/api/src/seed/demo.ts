import { createHash } from "node:crypto";
import { SIM_IDS, type Role, type SimId, type UserStatus } from "@egemed/contracts";
import {
  ausculta as auscultaBank,
  opaca as opacaBank,
  pulse as pulseBank,
} from "@egemed/assessment-bank";
import {
  OPACA_TOPICS,
  PULSE_MODES,
  SIM_BADGE_EVALUATORS,
  duelBadgeIds,
  duelStatsFrom,
  encodeAuscultaSummary,
  encodeOpacaSummary,
  encodePulseSummary,
  type AuscultaStats,
  type OpacaTopic,
  type SimLearnCounters,
} from "@egemed/gami-catalogs";
import { DEFAULT_RULES, assessmentXp, levelForXp, practiceXp } from "@egemed/gamification-core";
import { newSessionRow, seededRandom, type SimSessionRow } from "../me/simSessions";

/**
 * T258 — `pnpm --filter @egemed/api seed:demo`: demo veritabanını canlıya hazır,
 * dolu sahte veriyle kurar (depo sahibi isteği, 30 Eylül 2026). Tüm veri
 * SAHTEDİR, sabit tohumla deterministiktir ve gerçek kişi içermez (KVKK);
 * ad soyad yaygın Türkçe ad listelerinden birleştirilir, e-posta `@example.edu.tr`.
 *
 * Kohort türetimi: liderlik ve ödül uygunluğu kohortu `units.code`dan türetir
 * (`apps/api/src/me/leaderboard.ts` `cohortFromUnitCode`, desen `^(\d)-sinif$`);
 * bu yüzden dönem birimleri `1-sinif`…`6-sinif` kodlarıyla kurulur.
 *
 * Çalışma kuralları: üretimde reddedilir; tek transaction; yalnız kendi
 * yazdığı kayıtları siler (`demo.` kullanıcı öneki, `demo-` dosya öneki) —
 * `seed:dev` hesaplarına (`admin`, `ogrenci`, `ogrenci2`) ve ödüllere dokunmaz.
 * `audit_log` append-only olduğundan demo kullanıcılar denetim aktörü olamaz;
 * yönetici işlemleri kurumun mevcut admin hesabı adına yazılır.
 */

/** Sabit tohum: aynı girdi (tohum + `now`) → bit bit aynı plan. */
export const DEMO_SEED = 20_260_930;

/** Enjekte edilen an: 30 Eylül 2026 12:00 (İstanbul). `Date.now()` kullanılmaz. */
export const DEMO_NOW = Date.parse("2026-09-30T12:00:00+03:00");

/** Kendi kayıtlarımızı tanıyan işaretler; başka tohumların verisine dokunulmaz. */
export const DEMO_USERNAME_PREFIX = "demo.";
export const DEMO_BATCH_PREFIX = "demo-";

const DEMO_INSTITUTION_ID = "d0000000-0000-4000-8000-000000000000";
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Türkiye sabit ofseti (2016'dan beri UTC+3). */
const TR_OFFSET_MS = 3 * 60 * 60 * 1000;
const STUDENTS_PER_COHORT = 30;
const COHORTS = [1, 2, 3, 4, 5, 6] as const;
const STUDENT_COUNT = COHORTS.length * STUDENTS_PER_COHORT;
const RESIDENT_COUNT = 6;
const FACULTY_COUNT = 4;
const LEARN_CONTENT_VERSION = "lib-demo-1";

export interface DemoUnit {
  readonly code: string;
  readonly name: string;
  readonly parentCode: string | null;
}

/** Dönem birimleri kohort türetiminin sözleşmesidir: kod `^(\d)-sinif$` olmalıdır. */
export const DEMO_UNITS: readonly DemoUnit[] = [
  { code: "tip-fakultesi", name: "Tıp Fakültesi", parentCode: null },
  ...COHORTS.map((cohort) => ({ code: `${cohort}-sinif`, name: `Dönem ${cohort}`, parentCode: "tip-fakultesi" })),
  { code: "arastirma-gorevlileri", name: "Araştırma Görevlileri", parentCode: "tip-fakultesi" },
];

const FIRST_NAMES = [
  "Ahmet", "Ayşe", "Mehmet", "Elif", "Mustafa", "Zeynep", "Emre", "Merve", "Burak", "Selin",
  "Kerem", "Deniz", "Ece", "Kaan", "Sinem", "Onur", "Ceren", "Hakan", "Derya", "Baran",
  "İrem", "Berk", "Aslı", "Cem", "Gizem", "Serkan", "Nazlı", "Tolga", "Melis", "Uğur",
  "Pelin", "Volkan", "Şeyma", "Yiğit", "Burcu", "Oğuz",
] as const;

const LAST_NAMES = [
  "Yılmaz", "Kaya", "Demir", "Şahin", "Çelik", "Yıldız", "Yıldırım", "Öztürk", "Aydın", "Özdemir",
  "Arslan", "Doğan", "Kılıç", "Aslan", "Çetin", "Kara", "Koç", "Kurt", "Özkan", "Şimşek",
  "Polat", "Erdoğan", "Korkmaz", "Çakır", "Aksoy", "Yalçın", "Güneş", "Bulut", "Sarı", "Tekin",
  "Ünal", "Bozkurt", "Taş", "Acar", "Güler", "Kocaman",
] as const;

const AUSCULTA_LEARN_KEYS = [
  "heart.normal", "heart.s3", "heart.murmur.mid_systolic", "heart.atrial_fibrillation",
  "lung.normal", "lung.wheezing", "lung.crackles", "lung.pleural_rub",
] as const;

const OPACA_LEARN_KEYS = [
  "technique.systematic", "technique.projection", "technique.lateral", "ct.axial_anatomy", "ct.windows",
  "finding.normal", "finding.pneumothorax", "finding.pleural_effusion", "finding.nodule_mass",
  "finding.cardiomegaly", "finding.atelectasis", "finding.emphysema",
] as const;

const OPACA_STACK_IDS = [
  "commons_ct_axial_lung_window", "commons_ct_axial_mediastinal_window", "commons_pneumothorax_ct",
] as const;

export type DemoUserKind = "student" | "resident" | "faculty";

export interface DemoUser {
  readonly id: string;
  readonly kind: DemoUserKind;
  readonly unitCode: string;
  readonly username: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
  readonly status: UserStatus;
  readonly lastLoginAt: number | null;
  readonly deletedAt: number | null;
  readonly createdAt: number;
  readonly leaderboardVisible: boolean;
}

export interface DemoAttempt {
  readonly id: string;
  readonly userId: string;
  readonly simId: SimId;
  readonly attemptNo: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  readonly score: number;
  readonly maxScore: number;
  readonly passed: boolean;
  readonly summary: Readonly<Record<string, number>>;
  readonly mode: "practice" | "assessment";
  readonly caseCount: number;
  readonly hintsUsed: number;
  readonly xp: number;
}

export interface DemoProfile {
  readonly userId: string;
  readonly simId: SimId;
  readonly xp: number;
  readonly level: number;
  readonly streakCurrent: number;
  readonly streakBest: number;
  readonly streakLastDate: string | null;
  readonly updatedAt: number;
}

export interface DemoBadge {
  readonly userId: string;
  readonly simId: SimId;
  readonly badgeKey: string;
  readonly awardedAt: number;
}

export interface DemoLearn {
  readonly userId: string;
  readonly simId: SimId;
  readonly topic: string;
  readonly xp: number;
  readonly learnedAt: number;
}

export interface DemoCompletion {
  readonly userId: string;
  readonly simId: SimId;
  readonly completedAt: number;
  readonly contentVersion: string;
}

export type DemoChallengeStatus = "open" | "accepted" | "finished" | "expired";

export interface DemoChallenge {
  readonly id: string;
  readonly simId: SimId;
  readonly inviterId: string;
  readonly opponentId: string | null;
  readonly codeHash: string;
  readonly caseIds: readonly string[];
  readonly shuffleSeed: number;
  readonly status: DemoChallengeStatus;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly acceptedAt: number | null;
  readonly winnerRole: "inviter" | "opponent" | null;
  readonly winnerId: string | null;
  readonly finishedAt: number | null;
}

export interface DemoSession {
  readonly id: string;
  readonly userId: string;
  readonly institutionId: string;
  readonly simId: SimId;
  readonly challengeId: string;
  readonly status: "finished";
  readonly startedAt: number;
  readonly expiresAt: number;
  readonly finishedAt: number;
  readonly state: SimSessionRow["state"];
}

export interface DemoImportError {
  readonly column: string;
  readonly code: string;
  readonly message: string;
}

export interface DemoImportRow {
  readonly id: string;
  readonly rowNo: number;
  readonly username: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly role: string;
  readonly unitCode: string;
  readonly simAccess: readonly SimId[];
  readonly authMethod: string;
  readonly status: "valid" | "error" | "applied";
  readonly errors: readonly DemoImportError[];
  readonly matchedUserId: string | null;
  readonly createdAt: number;
  readonly appliedAt: number | null;
}

export interface DemoImportBatch {
  readonly id: string;
  readonly fileName: string;
  readonly mode: "ekle" | "guncelle";
  readonly status: "validated" | "applied";
  readonly templateVersion: string;
  readonly rows: readonly DemoImportRow[];
  readonly createdAt: number;
  readonly validatedAt: number;
  readonly appliedAt: number | null;
}

export interface DemoAudit {
  readonly occurredAt: number;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly summaryAfter: Readonly<Record<string, string>>;
}

export interface DemoPlan {
  readonly seed: number;
  readonly now: number;
  readonly institutionId: string;
  readonly units: readonly DemoUnit[];
  readonly users: readonly DemoUser[];
  readonly profiles: readonly DemoProfile[];
  readonly attempts: readonly DemoAttempt[];
  readonly badges: readonly DemoBadge[];
  readonly learn: readonly DemoLearn[];
  readonly completions: readonly DemoCompletion[];
  readonly challenges: readonly DemoChallenge[];
  readonly sessions: readonly DemoSession[];
  readonly imports: readonly DemoImportBatch[];
  readonly audits: readonly DemoAudit[];
}

export interface DemoSeedInput {
  readonly now: number;
  readonly seed?: number;
  /** Oturum satırları kurum kimliği taşır; DB yazıcısı gerçek kimliği geçirir. */
  readonly institutionId?: string;
}

type DemoRow = readonly (string | null)[];

function idFactory(prefix: string): (index: number) => string {
  return (index) => `${prefix}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

/** Türkçe harfleri ASCII'ye indirger; kullanıcı adı `^[a-z0-9][a-z0-9._-]{2,63}$`. */
function slug(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]/g, "");
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Anın Türkiye takvim günü (`YYYY-MM-DD`); seri ve `streak_last_date` bununla yazılır. */
function trDay(at: number): string {
  return new Date(at + TR_OFFSET_MS).toISOString().slice(0, 10);
}

interface DemoStreak {
  readonly current: number;
  readonly best: number;
  readonly lastDate: string | null;
}

function streakOf(days: readonly string[]): DemoStreak {
  const sorted = [...new Set(days)].sort();
  let current = 0;
  let best = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    current =
      previous !== null && Date.parse(`${day}T00:00:00Z`) - Date.parse(`${previous}T00:00:00Z`) === DAY_MS
        ? current + 1
        : 1;
    best = Math.max(best, current);
    previous = day;
  }
  return { current, best, lastDate: previous };
}

/** Sunucu kuralıyla aynı XP hesabı; testi `serverAttemptXp` ile eşitliği doğrular. */
function attemptXp(input: {
  readonly mode: "practice" | "assessment";
  readonly score: number;
  readonly caseCount: number;
  readonly hintsUsed: number;
  readonly passed: boolean;
}): number {
  return input.mode === "assessment"
    ? assessmentXp({ caseCount: input.caseCount, score: input.score }, DEFAULT_RULES)
    : practiceXp({ caseCount: input.caseCount, hintsUsed: input.hintsUsed, mastery: input.passed }, DEFAULT_RULES);
}

function opacaLearnCounters(topics: readonly string[]): SimLearnCounters {
  const library = opacaBank.opacaLibraryLearnCoverage(topics);
  return {
    topicsCount: new Set(topics.filter((topic) => topic.startsWith("opaca:topic:"))).size,
    stacksCount: new Set(topics.filter((topic) => topic.startsWith("opaca:stack:"))).size,
    libraryTopicsTotal: library.total,
    libraryTopicsCovered: library.covered,
  };
}

function learnTopicsFor(simId: SimId, studentIndex: number, simIndex: number): readonly string[] {
  const pick = <T>(values: readonly T[], count: number, offset: number): T[] =>
    Array.from({ length: count }, (_, position) => values[(offset + position) % values.length]!);
  if (simId === "pulse") {
    return pick(PULSE_MODES, 2 + (studentIndex % 3), studentIndex + simIndex).map((mode) => `pulse:mode:${mode}`);
  }
  if (simId === "ausculta") {
    return pick(AUSCULTA_LEARN_KEYS, 3 + (studentIndex % 3), studentIndex + simIndex).map((key) => `ausculta:topic:${key}`);
  }
  const topics = pick(OPACA_LEARN_KEYS, 4 + (studentIndex % 4), studentIndex + simIndex).map((key) => `opaca:topic:${key}`);
  if (studentIndex % 3 === 1) return topics;
  return [...topics, ...pick(OPACA_STACK_IDS, 1 + (studentIndex % 2), studentIndex).map((id) => `opaca:stack:${id}`)];
}

function pulseSummary(input: {
  readonly score: number;
  readonly caseCount: number;
  readonly studentIndex: number;
  readonly attemptIndex: number;
  readonly passed: boolean;
}): Record<string, number> {
  return {
    score: input.score,
    correct: Math.round((input.score * input.caseCount) / 100),
    total: input.caseCount,
    ...encodePulseSummary({
      score: input.score,
      extra: {
        ecgMode: PULSE_MODES[(input.studentIndex + input.attemptIndex) % PULSE_MODES.length]!,
        modeMastered: input.passed,
        correctlyReadLeads: Math.min(12, 2 + ((input.studentIndex + input.attemptIndex * 3) % 11)),
        caliperAccurate: input.score >= 70 ? true : null,
        rhythmRecognitionStreak: input.passed ? Math.min(25, 3 + input.attemptIndex * 2) : 0,
      },
    }),
  };
}

function auscultaSummary(input: {
  readonly score: number;
  readonly caseCount: number;
  readonly studentIndex: number;
  readonly attemptIndex: number;
}): Record<string, number> {
  const run = input.attemptIndex;
  const stats: AuscultaStats = {
    listenDisciplineCases: Math.min(run + 1, 4 + (input.studentIndex % 5)),
    systematicExams: Math.min(run + 1, 3 + (input.studentIndex % 4)),
    cardiacFociExams: Math.floor(run / 2),
    posteriorLungExams: Math.floor(run / 2),
    heartCorrect: {
      normal: Math.min(run + 1, 3 + (input.studentIndex % 3)),
      extraSounds: input.studentIndex % 4 === 0 ? Math.floor(run / 2) : 0,
      murmurTiming: Math.floor((run + (input.studentIndex % 2)) / 2),
      rhythm: input.studentIndex % 3 === 0 ? Math.floor(run / 2) : 0,
    },
    lungCorrect: {
      vesicular: Math.min(run + 1, 2 + (input.studentIndex % 4)),
      continuous: Math.floor(run / 3),
      crackles: Math.floor((run + 1) / 3),
      pleuralRub: input.studentIndex % 5 === 0 ? Math.floor(run / 3) : 0,
    },
    pediatricCorrect: input.studentIndex % 4 === 1 ? Math.floor(run / 3) : 0,
    mixedCorrect: input.studentIndex % 3 === 1 ? Math.floor(run / 3) : 0,
    headChoiceCorrect: Math.floor(run / 2),
    correctDiagnosisCount: run,
  };
  return {
    score: input.score,
    correct: Math.round((input.score * input.caseCount) / 100),
    total: input.caseCount,
    ...encodeAuscultaSummary(stats),
  };
}

function opacaSummary(input: {
  readonly score: number;
  readonly caseCount: number;
  readonly hintsUsed: number;
  readonly finishedAt: number;
  readonly studentIndex: number;
  readonly attemptIndex: number;
  readonly mode: "practice" | "assessment";
  readonly passed: boolean;
}): Record<string, number> {
  const topic = OPACA_TOPICS[(input.studentIndex + input.attemptIndex) % OPACA_TOPICS.length]!;
  const topicCorrect: Partial<Record<OpacaTopic, number>> = input.passed ? { [topic]: 1 } : {};
  return {
    score: input.score,
    correct: Math.round((input.score * input.caseCount) / 100),
    total: input.caseCount,
    ...encodeOpacaSummary({
      mode: input.mode,
      finishedAt: new Date(input.finishedAt).toISOString(),
      score: input.score,
      caseCount: input.caseCount,
      hintsUsed: input.hintsUsed,
      extra: {
        localizationHits: input.passed ? 2 : 0,
        abcdeComplete: input.score >= 85 ? 1 : 0,
        qualityCorrect: input.score >= 80 ? 1 : 0,
        interpretationCorrect: input.score >= 82 ? 1 : 0,
        fastPerfect: false,
        topicCorrect,
      },
    }),
  };
}

function caseIdsFor(simId: SimId, random: () => number): readonly string[] {
  if (simId === "pulse") return pulseBank.selectCaseIds("challenge", random);
  if (simId === "ausculta") return auscultaBank.selectCaseIds("challenge", random);
  return opacaBank.selectCaseIds("challenge", random);
}

/** Tek kurumluk demo planı üretir: saf fonksiyon, DB görmez, `Date.now()` kullanmaz. */
export function buildDemoPlan(input: DemoSeedInput): DemoPlan {
  const now = input.now;
  const seed = input.seed ?? DEMO_SEED;
  const institutionId = input.institutionId ?? DEMO_INSTITUTION_ID;
  const rng = seededRandom(seed);
  const nextUserId = idFactory("d0000001");
  const nextAttemptId = idFactory("d0000002");
  const nextChallengeId = idFactory("d0000003");
  const nextSessionId = idFactory("d0000004");
  const nextBatchId = idFactory("d0000005");
  const nextImportRowId = idFactory("d0000006");

  const users: DemoUser[] = [];
  const students: DemoUser[] = [];
  for (let index = 0; index < STUDENT_COUNT; index += 1) {
    const cohort = Math.floor(index / STUDENTS_PER_COHORT) + 1;
    const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
    const last = LAST_NAMES[(index * 7) % LAST_NAMES.length]!;
    const username = `${DEMO_USERNAME_PREFIX}${slug(first)}.${slug(last)}${index + 1}`;
    const status: UserStatus =
      index >= STUDENT_COUNT - 2 ? "deleted" : index % STUDENTS_PER_COHORT === 27 ? "suspended" : "active";
    const lastLoginAt =
      status === "deleted"
        ? null
        : status === "suspended"
          ? now - (5 + Math.floor(rng() * 40)) * DAY_MS
          : now - Math.floor(rng() * 30) * DAY_MS - Math.floor(rng() * 24) * HOUR_MS;
    const student: DemoUser = {
      id: nextUserId(users.length + 1),
      kind: "student",
      unitCode: `${cohort}-sinif`,
      username,
      displayName: `${first} ${last}`,
      email: `${username}@example.edu.tr`,
      roles: ["kullanici"],
      simAccess:
        index % 5 === 0
          ? [...SIM_IDS]
          : [SIM_IDS[index % 3]!, SIM_IDS[(index + 1) % 3]!],
      status,
      lastLoginAt,
      deletedAt: status === "deleted" ? now - (1 + (index % 3)) * DAY_MS : null,
      createdAt: now - (60 + Math.floor(rng() * 300)) * DAY_MS,
      leaderboardVisible: index % 19 !== 5,
    };
    users.push(student);
    students.push(student);
  }

  const staff = (kind: "resident" | "faculty", count: number, unitCode: string, role: Role, offset: number): void => {
    for (let index = 0; index < count; index += 1) {
      const first = FIRST_NAMES[(index * 5 + offset) % FIRST_NAMES.length]!;
      const last = LAST_NAMES[(index * 11 + offset) % LAST_NAMES.length]!;
      const username = `${DEMO_USERNAME_PREFIX}${slug(first)}.${slug(last)}${offset + index}`;
      users.push({
        id: nextUserId(users.length + 1),
        kind,
        unitCode,
        username,
        displayName: `${first} ${last}`,
        email: `${username}@example.edu.tr`,
        roles: [role],
        simAccess: [...SIM_IDS],
        status: "active",
        lastLoginAt: now - ((index * 3 + offset) % 28) * DAY_MS - index * HOUR_MS,
        deletedAt: null,
        createdAt: now - (120 + index * 9) * DAY_MS,
        leaderboardVisible: true,
      });
    }
  };
  staff("resident", RESIDENT_COUNT, "arastirma-gorevlileri", "uzmanlik_ogrencisi", 901);
  staff("faculty", FACULTY_COUNT, "tip-fakultesi", "ogretim_uyesi", 951);

  const profiles: DemoProfile[] = [];
  const attempts: DemoAttempt[] = [];
  const badges: DemoBadge[] = [];
  const learn: DemoLearn[] = [];
  const completions: DemoCompletion[] = [];
  const monthSpecs = [
    { month: 6, practice: 1, assessment: 1 },
    { month: 7, practice: 1, assessment: 2 },
    { month: 8, practice: 1, assessment: 3 },
  ] as const;

  students.forEach((student, studentIndex) => {
    student.simAccess.forEach((simId, simIndex) => {
      const ability = 52 + ((studentIndex * 13) % 41);
      const topics = learnTopicsFor(simId, studentIndex, simIndex);
      const learnedAt = topics.map(
        (_, position) => now - (2 + ((studentIndex + position * 3) % 55)) * DAY_MS - position * HOUR_MS,
      );
      topics.forEach((topic, position) => {
        learn.push({
          userId: student.id,
          simId,
          topic,
          xp: DEFAULT_RULES.xp.learnTopicFirstView,
          learnedAt: learnedAt[position]!,
        });
      });
      if ((studentIndex + simIndex) % 7 !== 0) {
        completions.push({
          userId: student.id,
          simId,
          completedAt: now - (3 + ((studentIndex + simIndex * 5) % 35)) * DAY_MS,
          contentVersion: LEARN_CONTENT_VERSION,
        });
      }

      const drafts: { mode: "practice" | "assessment"; finishedAt: number; score: number }[] = [];
      let position = 0;
      for (const spec of monthSpecs) {
        const bonus = spec.month === 8 && studentIndex % 3 === 0 ? { practice: 1, assessment: 2 } : { practice: 0, assessment: 0 };
        const practice = spec.practice + bonus.practice;
        const count = practice + spec.assessment + bonus.assessment;
        for (let step = 0; step < count; step += 1) {
          const mode = step < practice ? "practice" : "assessment";
          const day = 2 + ((studentIndex * 5 + position * 7 + simIndex * 3) % (spec.month === 8 ? 25 : 24));
          const finishedAt = Date.UTC(2026, spec.month, day, 9 + ((studentIndex + position) % 9) - 3, (studentIndex * 11 + position * 17) % 60);
          const jitter = rng() * 14 - 7;
          drafts.push({
            mode,
            finishedAt,
            score: clampInt(ability + jitter + (mode === "practice" ? 4 : 0), 25, 100),
          });
          position += 1;
        }
      }
      drafts.sort((a, b) => a.finishedAt - b.finishedAt);

      const own: DemoAttempt[] = drafts.map((draft, attemptIndex) => {
        const passed = draft.score >= 80;
        const caseCount = draft.mode === "assessment" ? 10 : 6;
        const hintsUsed = draft.mode === "assessment" ? attemptIndex % 3 : (attemptIndex + studentIndex) % 4;
        const summary =
          simId === "pulse"
            ? pulseSummary({ score: draft.score, caseCount, studentIndex, attemptIndex, passed })
            : simId === "ausculta"
              ? auscultaSummary({ score: draft.score, caseCount, studentIndex, attemptIndex })
              : opacaSummary({
                  score: draft.score,
                  caseCount,
                  hintsUsed,
                  finishedAt: draft.finishedAt,
                  studentIndex,
                  attemptIndex,
                  mode: draft.mode,
                  passed,
                });
        const attempt: DemoAttempt = {
          id: nextAttemptId(attempts.length + attemptIndex + 1),
          userId: student.id,
          simId,
          attemptNo: attemptIndex + 1,
          startedAt: draft.finishedAt - (20 + ((studentIndex + attemptIndex) % 25)) * 60_000,
          finishedAt: draft.finishedAt,
          score: draft.score,
          maxScore: 100,
          passed,
          summary,
          mode: draft.mode,
          caseCount,
          hintsUsed,
          xp: attemptXp({ mode: draft.mode, score: draft.score, caseCount, hintsUsed, passed }),
        };
        return attempt;
      });
      attempts.push(...own);

      const totalXp =
        own.reduce((sum, attempt) => sum + attempt.xp, 0) +
        topics.length * DEFAULT_RULES.xp.learnTopicFirstView;
      const streak = streakOf(own.map((attempt) => trDay(attempt.finishedAt)));
      profiles.push({
        userId: student.id,
        simId,
        xp: totalXp,
        level: levelForXp(totalXp, DEFAULT_RULES).level,
        streakCurrent: streak.current,
        streakBest: streak.best,
        streakLastDate: streak.lastDate,
        updatedAt: Math.max(own.at(-1)?.finishedAt ?? 0, learnedAt.at(-1) ?? 0, now),
      });

      const evaluator = SIM_BADGE_EVALUATORS[simId];
      const awardedAt = own.at(-1)?.finishedAt ?? now;
      if (evaluator !== undefined) {
        const earned = evaluator.newlyEarned(
          own.map((attempt) => attempt.summary),
          [],
          new Date(now),
          simId === "opaca" ? opacaLearnCounters(topics) : undefined,
        );
        for (const badgeKey of earned) badges.push({ userId: student.id, simId, badgeKey, awardedAt });
      }
    });
  });

  const activeStudents = students.filter((student) => student.status === "active");
  const challenges: DemoChallenge[] = [];
  const sessions: DemoSession[] = [];
  const addDuelSession = (challenge: DemoChallenge, userId: string, total: number): void => {
    const finishedAt = challenge.finishedAt ?? now;
    const startedAt = finishedAt - 8 * 60_000;
    const row = newSessionRow({
      id: nextSessionId(sessions.length + 1),
      userId,
      institutionId,
      simId: challenge.simId,
      mode: "challenge",
      caseIds: challenge.caseIds,
      at: startedAt,
      challengeId: challenge.id,
      shuffleSeed: challenge.shuffleSeed,
    });
    row.status = "finished";
    row.finishedAt = finishedAt;
    row.state.total = total;
    sessions.push({
      id: row.id,
      userId: row.userId,
      institutionId: row.institutionId,
      simId: row.simId,
      challengeId: challenge.id,
      status: "finished",
      startedAt: row.startedAt,
      expiresAt: row.expiresAt,
      finishedAt,
      state: row.state,
    });
  };

  SIM_IDS.forEach((simId, simIndex) => {
    const pool = activeStudents.filter((student) => student.simAccess.includes(simId));
    const pick = (offset: number): DemoUser => pool[(simIndex * 17 + offset) % pool.length]!;
    const codeHash = (label: string): string =>
      createHash("sha256").update(`egemed-challenge:${label}`, "utf8").digest("hex");
    const push = (
      id: string,
      inviter: DemoUser,
      opponent: DemoUser | null,
      status: DemoChallengeStatus,
      at: { readonly createdAt: number; readonly acceptedAt: number | null; readonly expiresAt: number; readonly finishedAt: number | null },
      winnerRole: "inviter" | "opponent" | null,
    ): DemoChallenge => {
      const challenge: DemoChallenge = {
        id,
        simId,
        inviterId: inviter.id,
        opponentId: opponent?.id ?? null,
        codeHash: codeHash(`${simId}-${id}`),
        caseIds: caseIdsFor(simId, rng),
        shuffleSeed: Math.floor(rng() * 2 ** 31),
        status,
        createdAt: at.createdAt,
        expiresAt: at.expiresAt,
        acceptedAt: at.acceptedAt,
        winnerRole,
        winnerId: winnerRole === null || opponent === null ? null : winnerRole === "inviter" ? inviter.id : opponent.id,
        finishedAt: at.finishedAt,
      };
      challenges.push(challenge);
      return challenge;
    };

    for (let k = 0; k < 4; k += 1) {
      const inviter = pick(k * 3 + 1);
      const opponent = pick(k * 3 + 5);
      const createdAt = now - (3 + k) * DAY_MS - (k % 2) * HOUR_MS;
      const acceptedAt = createdAt + (2 + k) * HOUR_MS;
      const inviterScore = 60 + ((simIndex * 7 + k * 13) % 35);
      const opponentScore = 58 + ((simIndex * 5 + k * 11) % 37);
      const ifEqual = opponentScore === inviterScore ? opponentScore + 1 : opponentScore;
      const challenge = push(
        nextChallengeId(challenges.length + 1),
        inviter,
        opponent,
        "finished",
        {
          createdAt,
          acceptedAt,
          expiresAt: acceptedAt + 20 * HOUR_MS,
          finishedAt: acceptedAt + (1 + (k % 3)) * HOUR_MS,
        },
        inviterScore >= ifEqual ? "inviter" : "opponent",
      );
      if (challenge.finishedAt !== null) {
        addDuelSession(challenge, inviter.id, inviterScore);
        addDuelSession(challenge, opponent.id, ifEqual);
      }
    }
    for (let k = 0; k < 2; k += 1) {
      const createdAt = now - (2 + k) * HOUR_MS;
      push(nextChallengeId(challenges.length + 1), pick(k * 7 + 2), null, "open", {
        createdAt,
        acceptedAt: null,
        expiresAt: createdAt + 24 * HOUR_MS,
        finishedAt: null,
      }, null);
    }
    const acceptedAt = now - 18 * HOUR_MS;
    const accepted = push(
      nextChallengeId(challenges.length + 1),
      pick(3),
      pick(11),
      "accepted",
      { createdAt: now - 20 * HOUR_MS, acceptedAt, expiresAt: now - 20 * HOUR_MS + 24 * HOUR_MS, finishedAt: null },
      null,
    );
    if (accepted.opponentId !== null) addDuelSession(accepted, accepted.inviterId, 74);
    for (let k = 0; k < 2; k += 1) {
      const createdAt = now - (4 + k) * DAY_MS;
      push(
        nextChallengeId(challenges.length + 1),
        pick(k * 9 + 4),
        pick(k * 9 + 8),
        "expired",
        { createdAt, acceptedAt: k === 0 ? createdAt + 3 * HOUR_MS : null, expiresAt: createdAt + 24 * HOUR_MS, finishedAt: null },
        null,
      );
    }
  });

  for (const challenge of challenges) {
    if (challenge.status !== "finished" || challenge.opponentId === null || challenge.finishedAt === null) continue;
    for (const userId of [challenge.inviterId, challenge.opponentId]) {
      const rows = challenges
        .filter((candidate) => candidate.simId === challenge.simId && candidate.status === "finished")
        .map((candidate) => ({
          inviterId: candidate.inviterId,
          opponentId: candidate.opponentId,
          winner: candidate.winnerRole,
          finishedAt: candidate.finishedAt,
        }));
      for (const badgeKey of duelBadgeIds(duelStatsFrom(rows, userId), new Date(now))) {
        if (!badges.some((badge) => badge.userId === userId && badge.simId === challenge.simId && badge.badgeKey === badgeKey)) {
          badges.push({ userId, simId: challenge.simId, badgeKey, awardedAt: challenge.finishedAt });
        }
      }
    }
  }

  const importRow = (
    batchIndex: number,
    rowNo: number,
    student: DemoUser,
    overrides: { readonly status: "valid" | "error" | "applied"; readonly errors?: readonly DemoImportError[] },
  ): DemoImportRow => ({
    id: nextImportRowId(batchIndex * 100 + rowNo),
    rowNo,
    username: student.username,
    email: student.email,
    displayName: student.displayName,
    role: "kullanici",
    unitCode: student.unitCode,
    simAccess: [...SIM_IDS],
    authMethod: "dev",
    status: overrides.status,
    errors: overrides.errors ?? [],
    matchedUserId: null,
    createdAt: now - (9 - batchIndex * 3) * DAY_MS,
    appliedAt: overrides.status === "applied" ? now - (9 - batchIndex * 3) * DAY_MS + 2 * HOUR_MS : null,
  });
  const imports: DemoImportBatch[] = [
    {
      id: nextBatchId(1),
      fileName: `${DEMO_BATCH_PREFIX}donem1-ekle.csv`,
      mode: "ekle",
      status: "applied",
      templateVersion: "1",
      rows: [0, 1, 2, 3].map((offset) => importRow(1, offset + 1, students[offset]!, { status: "applied" })),
      createdAt: now - 9 * DAY_MS,
      validatedAt: now - 9 * DAY_MS + HOUR_MS,
      appliedAt: now - 9 * DAY_MS + 2 * HOUR_MS,
    },
    {
      id: nextBatchId(2),
      fileName: `${DEMO_BATCH_PREFIX}donem3-guncelle.csv`,
      mode: "guncelle",
      status: "validated",
      templateVersion: "1",
      rows: [60, 61, 62].map((index) => ({
        ...importRow(2, index - 59, students[index]!, { status: "valid" }),
        matchedUserId: students[index]!.id,
      })),
      createdAt: now - 6 * DAY_MS,
      validatedAt: now - 6 * DAY_MS + HOUR_MS,
      appliedAt: null,
    },
    {
      id: nextBatchId(3),
      fileName: `${DEMO_BATCH_PREFIX}donem6-hatali.csv`,
      mode: "ekle",
      status: "validated",
      templateVersion: "1",
      rows: [
        importRow(3, 1, students[150]!, { status: "valid" }),
        importRow(3, 2, students[151]!, { status: "valid" }),
        importRow(3, 3, students[152]!, {
          status: "error",
          errors: [{ column: "birim_kodu", code: "unknown_unit", message: "Bilinmeyen birim kodu." }],
        }),
        importRow(3, 4, students[153]!, { status: "valid" }),
        importRow(3, 5, students[154]!, {
          status: "error",
          errors: [{ column: "kullanici_adi", code: "duplicate_mapping_key", message: "Bu kullanıcı zaten kayıtlı." }],
        }),
      ],
      createdAt: now - 3 * DAY_MS,
      validatedAt: now - 3 * DAY_MS + HOUR_MS,
      appliedAt: null,
    },
  ];
  const AUDIT_SPECS: readonly Omit<DemoAudit, "occurredAt">[] = [
    { action: "user.create", targetType: "user", targetId: null, summaryAfter: { role: "kullanici", source: "import" } },
    { action: "user.create", targetType: "user", targetId: null, summaryAfter: { role: "kullanici", source: "import" } },
    { action: "user.create", targetType: "user", targetId: null, summaryAfter: { role: "kullanici", source: "import" } },
    { action: "user.create", targetType: "user", targetId: null, summaryAfter: { role: "kullanici", source: "import" } },
    { action: "user.create", targetType: "user", targetId: null, summaryAfter: { role: "kullanici", source: "manual" } },
    { action: "user.create", targetType: "user", targetId: null, summaryAfter: { role: "uzmanlik_ogrencisi", source: "manual" } },
    { action: "role.grant", targetType: "user", targetId: null, summaryAfter: { role: "kullanici" } },
    { action: "role.grant", targetType: "user", targetId: null, summaryAfter: { role: "ogretim_uyesi" } },
    { action: "role.revoke", targetType: "user", targetId: null, summaryAfter: { role: "uzmanlik_ogrencisi" } },
    { action: "user.suspend", targetType: "user", targetId: null, summaryAfter: { status: "suspended" } },
    { action: "user.suspend", targetType: "user", targetId: null, summaryAfter: { status: "suspended" } },
    { action: "user.activate", targetType: "user", targetId: null, summaryAfter: { status: "active" } },
    { action: "import.upload", targetType: "import_batch", targetId: null, summaryAfter: { fileName: "demo-donem1-ekle.csv", mode: "ekle", status: "uploaded" } },
    { action: "import.validate", targetType: "import_batch", targetId: null, summaryAfter: { validCount: "4", errorCount: "0" } },
    { action: "import.apply", targetType: "import_batch", targetId: null, summaryAfter: { appliedCount: "4" } },
    { action: "import.upload", targetType: "import_batch", targetId: null, summaryAfter: { fileName: "demo-donem6-hatali.csv", mode: "ekle", status: "uploaded" } },
    { action: "import.validate", targetType: "import_batch", targetId: null, summaryAfter: { validCount: "3", errorCount: "2" } },
    { action: "reward.upsert", targetType: "monthly_reward", targetId: null, summaryAfter: { simId: "pulse", month: "2026-10" } },
    { action: "reward.upsert", targetType: "monthly_reward", targetId: null, summaryAfter: { simId: "opaca", month: "2026-10" } },
  ];
  const audits: DemoAudit[] = AUDIT_SPECS.map((spec, index) => {
    const target =
      spec.targetType === "user"
        ? (spec.action.startsWith("role.")
            ? users.find((user) => !user.roles.includes("kullanici"))?.id
            : students[(index * 11) % students.length]!.id) ?? students[0]!.id
        : spec.targetType === "import_batch"
          ? imports[index % imports.length]!.id
          : null;
    return {
      occurredAt: now - ((index * 9 + 3) % (14 * 24)) * HOUR_MS - (index % 4) * HOUR_MS,
      action: spec.action,
      targetType: spec.targetType,
      targetId: target,
      summaryAfter: { ...spec.summaryAfter, source: "seed:demo" },
    };
  });

  return {
    seed,
    now,
    institutionId,
    units: DEMO_UNITS,
    users,
    profiles,
    attempts,
    badges,
    learn,
    completions,
    challenges,
    sessions,
    imports,
    audits,
  };
}

// ---------------------------------------------------------------------------
// Veritabanı yazımı (tek transaction; yeniden çalıştırılabilir)
// ---------------------------------------------------------------------------

/** Havuzun bu betiğe görünen dar yüzeyi (`seed/repo.ts` `SeedDb` ile aynı desen). */
export interface DemoDb {
  query(text: string, params?: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
  transaction<T>(work: (query: DemoDb["query"]) => Promise<T>): Promise<T>;
}

export type DemoQuery = DemoDb["query"];

export interface DemoSeedDatabaseInput {
  readonly nodeEnv: "development" | "test" | "production";
  readonly institutionCode: string;
  readonly now: number;
  readonly seed?: number;
}

export interface DemoSeedSummary {
  readonly institutionCode: string;
  readonly students: number;
  readonly residents: number;
  readonly faculty: number;
  readonly units: number;
  readonly profiles: number;
  readonly attempts: number;
  readonly badges: number;
  readonly learn: number;
  readonly completions: number;
  readonly challenges: number;
  readonly sessions: number;
  readonly imports: number;
  readonly importRows: number;
  readonly audits: number;
}

const BULK_CHUNK = 400;

function textOf(value: string | number | boolean | null): string | null {
  return value === null ? null : String(value);
}

function timeOf(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** `{a,b}` metin dizisi gösterimi; yalnız `[A-Za-z0-9_.:-]` anahtarlar için güvenlidir. */
function arrayText(values: readonly string[]): string {
  return `{${values.join(",")}}`;
}

interface BulkColumn {
  readonly name: string;
  readonly cast: string;
}

/** Kısa ömürlü tohum verisi için toplu `insert … select … from unnest`; değerler parametrelidir. */
async function bulkInsert(
  query: DemoQuery,
  table: string,
  columns: readonly BulkColumn[],
  rows: readonly DemoRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const names = columns.map((column) => column.name).join(", ");
  const params = columns.map((_, index) => `$${index + 1}::text[]`).join(", ");
  const select = columns.map((column) => `r.${column.name}::${column.cast}`).join(", ");
  for (let start = 0; start < rows.length; start += BULK_CHUNK) {
    const chunk = rows.slice(start, start + BULK_CHUNK);
    await query(
      `insert into ${table} (${names}) select ${select} from unnest(${params}) as r(${names})`,
      columns.map((_, index) => chunk.map((row) => row[index] ?? null)),
    );
  }
}

async function findInstitution(query: DemoQuery, code: string): Promise<string> {
  const result = await query("select id from institutions where code = $1 and deleted_at is null limit 1", [code]);
  const row = result.rows[0] as { readonly id?: string } | undefined;
  if (row?.id === undefined) throw new Error(`kurum bulunamadı: ${code} (önce seed:dev çalıştırın)`);
  return row.id;
}

async function findAdminId(query: DemoQuery, institutionId: string): Promise<string | null> {
  const result = await query(
    `select u.id from users u
     join user_roles r on r.user_id = u.id and r.role = 'admin'
     where u.institution_id = $1 and u.deleted_at is null
     order by (u.username = 'admin') desc, u.created_at asc limit 1`,
    [institutionId],
  );
  return (result.rows[0] as { readonly id?: string } | undefined)?.id ?? null;
}

/** Yalnız bu betiğin yazdığı kayıtlar silinir; denetim günlüğü append-only olduğundan dokunulmaz. */
async function cleanup(query: DemoQuery, institutionId: string): Promise<void> {
  await query(
    `delete from challenges where institution_id = $1 and (
       inviter_id in (select id from users where institution_id = $1 and starts_with(username, $2))
       or opponent_id in (select id from users where institution_id = $1 and starts_with(username, $2)))`,
    [institutionId, DEMO_USERNAME_PREFIX],
  );
  await query("delete from import_batches where institution_id = $1 and starts_with(file_name, $2)", [
    institutionId,
    DEMO_BATCH_PREFIX,
  ]);
  await query("delete from users where institution_id = $1 and starts_with(username, $2)", [
    institutionId,
    DEMO_USERNAME_PREFIX,
  ]);
}

async function ensureUnits(
  query: DemoQuery,
  institutionId: string,
  now: number,
): Promise<ReadonlyMap<string, string>> {
  for (const unit of DEMO_UNITS) {
    await query(
      `insert into units (institution_id, parent_id, code, name, created_at, updated_at)
       select $1, (select id from units where institution_id = $1 and code = $2 and deleted_at is null limit 1), $3, $4, $5, $5
       where not exists (select 1 from units where institution_id = $1 and code = $3 and deleted_at is null)`,
      [institutionId, unit.parentCode, unit.code, unit.name, new Date(now)],
    );
  }
  const result = await query(
    "select code, id from units where institution_id = $1 and deleted_at is null and code = any($2::text[])",
    [institutionId, DEMO_UNITS.map((unit) => unit.code)],
  );
  const ids = new Map<string, string>();
  for (const row of result.rows) {
    const value = row as { readonly code: string; readonly id: string };
    ids.set(value.code, value.id);
  }
  return ids;
}

async function insertUsers(
  query: DemoQuery,
  institutionId: string,
  unitIds: ReadonlyMap<string, string>,
  plan: DemoPlan,
): Promise<void> {
  await bulkInsert(
    query,
    "users",
    [
      { name: "id", cast: "uuid" },
      { name: "institution_id", cast: "uuid" },
      { name: "unit_id", cast: "uuid" },
      { name: "username", cast: "text" },
      { name: "email", cast: "text" },
      { name: "display_name", cast: "text" },
      { name: "auth_method", cast: "text" },
      { name: "status", cast: "text" },
      { name: "xapi_actor_id", cast: "text" },
      { name: "created_at", cast: "timestamptz" },
      { name: "updated_at", cast: "timestamptz" },
      { name: "last_login_at", cast: "timestamptz" },
      { name: "deleted_at", cast: "timestamptz" },
      { name: "leaderboard_visible", cast: "boolean" },
    ],
    plan.users.map((user) => [
      user.id,
      institutionId,
      unitIds.get(user.unitCode) ?? null,
      user.username,
      user.email,
      user.displayName,
      // Demo hesapları geliştirme sağlayıcısıyla açılır (`duello.*` deseniyle
      // aynı): üretimde `AUTH_DEV_ENABLED` kapalıdır ve giriş yapılamaz.
      "dev",
      user.status,
      `demo-${user.id}`,
      timeOf(user.createdAt),
      timeOf(user.createdAt),
      timeOf(user.lastLoginAt),
      timeOf(user.deletedAt),
      textOf(user.leaderboardVisible),
    ]),
  );
  const roleRows: DemoRow[] = plan.users.flatMap((user) =>
    user.roles.map((role) => [user.id, role, null, timeOf(user.createdAt)]),
  );
  await bulkInsert(
    query,
    "user_roles",
    [
      { name: "user_id", cast: "uuid" },
      { name: "role", cast: "text" },
      { name: "granted_by", cast: "uuid" },
      { name: "granted_at", cast: "timestamptz" },
    ],
    roleRows,
  );
  const accessRows: DemoRow[] = plan.users.flatMap((user) =>
    user.simAccess.map((simId) => [user.id, simId, null, timeOf(user.createdAt)]),
  );
  await bulkInsert(
    query,
    "sim_access",
    [
      { name: "user_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "granted_by", cast: "uuid" },
      { name: "granted_at", cast: "timestamptz" },
    ],
    accessRows,
  );
}

async function insertContent(query: DemoQuery, institutionId: string, plan: DemoPlan): Promise<void> {
  await bulkInsert(
    query,
    "gami_profiles",
    [
      { name: "user_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "xp", cast: "int" },
      { name: "level", cast: "int" },
      { name: "streak_current", cast: "int" },
      { name: "streak_best", cast: "int" },
      { name: "streak_last_date", cast: "date" },
      { name: "updated_at", cast: "timestamptz" },
    ],
    plan.profiles.map((profile) => [
      profile.userId,
      profile.simId,
      textOf(profile.xp),
      textOf(profile.level),
      textOf(profile.streakCurrent),
      textOf(profile.streakBest),
      profile.streakLastDate,
      timeOf(profile.updatedAt),
    ]),
  );
  await bulkInsert(
    query,
    "gami_attempts",
    [
      { name: "id", cast: "uuid" },
      { name: "user_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "attempt_no", cast: "int" },
      { name: "started_at", cast: "timestamptz" },
      { name: "finished_at", cast: "timestamptz" },
      { name: "score", cast: "int" },
      { name: "max_score", cast: "int" },
      { name: "passed", cast: "boolean" },
      { name: "summary", cast: "jsonb" },
      { name: "created_at", cast: "timestamptz" },
      { name: "mode", cast: "text" },
      { name: "case_count", cast: "int" },
      { name: "hints_used", cast: "int" },
      { name: "xp", cast: "int" },
    ],
    plan.attempts.map((attempt) => [
      attempt.id,
      attempt.userId,
      attempt.simId,
      textOf(attempt.attemptNo),
      timeOf(attempt.startedAt),
      timeOf(attempt.finishedAt),
      textOf(attempt.score),
      textOf(attempt.maxScore),
      textOf(attempt.passed),
      JSON.stringify(attempt.summary),
      timeOf(attempt.finishedAt),
      attempt.mode,
      textOf(attempt.caseCount),
      textOf(attempt.hintsUsed),
      textOf(attempt.xp),
    ]),
  );
  await bulkInsert(
    query,
    "gami_badges",
    [
      { name: "user_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "badge_key", cast: "text" },
      { name: "awarded_at", cast: "timestamptz" },
    ],
    plan.badges.map((badge) => [badge.userId, badge.simId, badge.badgeKey, timeOf(badge.awardedAt)]),
  );
  await bulkInsert(
    query,
    "gami_learn",
    [
      { name: "user_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "topic", cast: "text" },
      { name: "xp", cast: "int" },
      { name: "learned_at", cast: "timestamptz" },
      { name: "created_at", cast: "timestamptz" },
    ],
    plan.learn.map((entry) => [
      entry.userId,
      entry.simId,
      entry.topic,
      textOf(entry.xp),
      timeOf(entry.learnedAt),
      timeOf(entry.learnedAt),
    ]),
  );
  await bulkInsert(
    query,
    "sim_learn_completions",
    [
      { name: "user_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "completed_at", cast: "timestamptz" },
      { name: "content_version", cast: "text" },
    ],
    plan.completions.map((completion) => [
      completion.userId,
      completion.simId,
      timeOf(completion.completedAt),
      completion.contentVersion,
    ]),
  );
  await bulkInsert(
    query,
    "challenges",
    [
      { name: "id", cast: "uuid" },
      { name: "institution_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "inviter_id", cast: "uuid" },
      { name: "opponent_id", cast: "uuid" },
      { name: "code_hash", cast: "text" },
      { name: "case_ids", cast: "text[]" },
      { name: "shuffle_seed", cast: "bigint" },
      { name: "status", cast: "text" },
      { name: "created_at", cast: "timestamptz" },
      { name: "expires_at", cast: "timestamptz" },
      { name: "accepted_at", cast: "timestamptz" },
      { name: "winner_id", cast: "uuid" },
      { name: "finished_at", cast: "timestamptz" },
    ],
    plan.challenges.map((challenge) => [
      challenge.id,
      institutionId,
      challenge.simId,
      challenge.inviterId,
      challenge.opponentId,
      challenge.codeHash,
      arrayText(challenge.caseIds),
      textOf(challenge.shuffleSeed),
      challenge.status,
      timeOf(challenge.createdAt),
      timeOf(challenge.expiresAt),
      timeOf(challenge.acceptedAt),
      challenge.winnerId,
      timeOf(challenge.finishedAt),
    ]),
  );
  await bulkInsert(
    query,
    "sim_sessions",
    [
      { name: "id", cast: "uuid" },
      { name: "user_id", cast: "uuid" },
      { name: "institution_id", cast: "uuid" },
      { name: "sim_id", cast: "text" },
      { name: "mode", cast: "text" },
      { name: "status", cast: "text" },
      { name: "state", cast: "jsonb" },
      { name: "started_at", cast: "timestamptz" },
      { name: "expires_at", cast: "timestamptz" },
      { name: "finished_at", cast: "timestamptz" },
      { name: "challenge_id", cast: "uuid" },
    ],
    plan.sessions.map((session) => [
      session.id,
      session.userId,
      institutionId,
      session.simId,
      "challenge",
      session.status,
      JSON.stringify(session.state),
      timeOf(session.startedAt),
      timeOf(session.expiresAt),
      timeOf(session.finishedAt),
      session.challengeId,
    ]),
  );
}

async function insertImports(
  query: DemoQuery,
  institutionId: string,
  uploadedBy: string,
  unitIds: ReadonlyMap<string, string>,
  plan: DemoPlan,
): Promise<number> {
  let rows = 0;
  for (const batch of plan.imports) {
    const validCount = batch.rows.filter((row) => row.status !== "error").length;
    const errorCount = batch.rows.length - validCount;
    await query(
      `insert into import_batches (id, institution_id, uploaded_by, file_name, mode, status, template_version,
         row_count, valid_count, error_count, applied_count, created_at, validated_at, applied_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, null)`,
      [
        batch.id,
        institutionId,
        uploadedBy,
        batch.fileName,
        batch.mode,
        batch.status,
        batch.templateVersion,
        batch.rows.length,
        validCount,
        errorCount,
        batch.status === "applied" ? batch.rows.length : 0,
        new Date(batch.createdAt),
        new Date(batch.validatedAt),
        batch.appliedAt === null ? null : new Date(batch.appliedAt),
      ],
    );
    await bulkInsert(
      query,
      "import_rows",
      [
        { name: "id", cast: "uuid" },
        { name: "batch_id", cast: "uuid" },
        { name: "row_no", cast: "int" },
        { name: "raw", cast: "jsonb" },
        { name: "normalized", cast: "jsonb" },
        { name: "status", cast: "text" },
        { name: "errors", cast: "jsonb" },
        { name: "matched_user_id", cast: "uuid" },
        { name: "created_at", cast: "timestamptz" },
        { name: "applied_at", cast: "timestamptz" },
      ],
      batch.rows.map((row) => {
        const simAccess = row.simAccess.join(",");
        return [
          row.id,
          batch.id,
          textOf(row.rowNo),
          JSON.stringify([
            row.username ?? "",
            row.email ?? "",
            row.displayName,
            row.role,
            row.unitCode,
            simAccess,
            row.authMethod,
          ]),
          row.status === "error"
            ? null
            : JSON.stringify({
                kullanici_adi: row.username ?? undefined,
                eposta: row.email ?? undefined,
                ad_soyad: row.displayName,
                rol: row.role,
                birim_kodu: row.unitCode,
                sim_erisimi: row.simAccess,
                giris_tipi: row.authMethod,
                unitId: unitIds.get(row.unitCode) ?? null,
              }),
          row.status,
          row.errors.length === 0 ? null : JSON.stringify(row.errors),
          row.matchedUserId,
          timeOf(row.createdAt),
          timeOf(row.appliedAt),
        ];
      }),
    );
    rows += batch.rows.length;
  }
  return rows;
}

/**
 * Denetim günlüğü append-only'dir (003): silme yoktur. Bu yüzden demo kayıtları
 * `(kurum, eylem, an)` ile bir kez yazılır — yeniden çalıştırma satır çoğaltmaz.
 */
async function insertAudits(
  query: DemoQuery,
  institutionId: string,
  actorUserId: string | null,
  plan: DemoPlan,
): Promise<void> {
  if (plan.audits.length === 0) return;
  const columns = [
    "occurred_at",
    "actor_user_id",
    "actor_role",
    "institution_id",
    "action",
    "target_type",
    "target_id",
    "summary_before",
    "summary_after",
    "request_id",
  ] as const;
  const rows: DemoRow[] = plan.audits.map((audit) => [
    timeOf(audit.occurredAt),
    actorUserId,
    "admin",
    institutionId,
    audit.action,
    audit.targetType,
    audit.targetId,
    null,
    JSON.stringify(audit.summaryAfter),
    null,
  ]);
  await query(
    `insert into audit_log (${columns.join(", ")})
     select r.occurred_at::timestamptz, r.actor_user_id::uuid, r.actor_role, r.institution_id::uuid,
            r.action, r.target_type, r.target_id::uuid, r.summary_before::jsonb, r.summary_after::jsonb, r.request_id
     from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[])
       as r(occurred_at, actor_user_id, actor_role, institution_id, action, target_type, target_id, summary_before, summary_after, request_id)
     where not exists (
       select 1 from audit_log a
       where a.institution_id = r.institution_id::uuid and a.action = r.action and a.occurred_at = r.occurred_at::timestamptz)`,
    columns.map((_, index) => rows.map((row) => row[index] ?? null)),
  );
}

/**
 * Demo planını tek transaction'da yazar. Üretimde hiçbir sorgu çalıştırmadan
 * reddeder; yeniden çalıştırma seed'e ait sayıları değiştirmez (denetim
 * günlüğü append-only olduğundan demo denetim satırları bir kez yazılır).
 */
export async function seedDemoDatabase(db: DemoDb, input: DemoSeedDatabaseInput): Promise<DemoSeedSummary> {
  if (input.nodeEnv === "production") {
    throw new Error("seed:demo üretim ortamında çalıştırılamaz.");
  }
  return db.transaction(async (query) => {
    const institutionId = await findInstitution(query, input.institutionCode);
    const adminId = await findAdminId(query, institutionId);
    await cleanup(query, institutionId);
    const unitIds = await ensureUnits(query, institutionId, input.now);
    const plan = buildDemoPlan({
      now: input.now,
      institutionId,
      ...(input.seed === undefined ? {} : { seed: input.seed }),
    });

    await insertUsers(query, institutionId, unitIds, plan);
    await insertContent(query, institutionId, plan);
    const importRows = adminId === null ? 0 : await insertImports(query, institutionId, adminId, unitIds, plan);
    await insertAudits(query, institutionId, adminId, plan);

    return {
      institutionCode: input.institutionCode,
      students: plan.users.filter((user) => user.kind === "student").length,
      residents: plan.users.filter((user) => user.kind === "resident").length,
      faculty: plan.users.filter((user) => user.kind === "faculty").length,
      units: plan.units.length,
      profiles: plan.profiles.length,
      attempts: plan.attempts.length,
      badges: plan.badges.length,
      learn: plan.learn.length,
      completions: plan.completions.length,
      challenges: plan.challenges.length,
      sessions: plan.sessions.length,
      imports: adminId === null ? 0 : plan.imports.length,
      importRows,
      audits: plan.audits.length,
    };
  });
}
