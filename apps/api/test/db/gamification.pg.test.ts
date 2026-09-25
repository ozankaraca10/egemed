import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { encodePulseSummary } from "@egemed/gami-catalogs";
import { DEFAULT_RULES, levelForXp } from "@egemed/gamification-core";
import {
  createPgGamificationRepo,
  levelForXpClosedForm,
  serverAttemptXp,
  type GamiAttemptInput,
  type GamificationRepo,
} from "../../src/me/gamification";
import {
  ALI_ID,
  BORA_ID,
  DAY,
  FIXED_NOW,
  HOUR,
  INSTITUTION_ID,
  MERT_ID,
  closeSchema,
  connectToSchema,
  databaseUrl,
  insertInstitution,
  insertUser,
  resetDatabase,
  uuidLike,
} from "./db-harness";

// T126 — oyunlaştırma SQL'inin gerçek PostgreSQL'de doğrulanması (Astra
// denetimi): deneme+profil tek ifadesi (XP/düzey/seri), ADR-008 rozet
// değerlendirmesi ve T100 liderlik tercihi. Her test geçici şemayı sıfırlar;
// DATABASE_URL yoksa açık mesajla atlanır (FAIL etmez).

const SCHEMA = "t126_gamification";
const D1 = Date.parse("2026-09-20T09:00:00.000Z");

let client: Client;

function repo(): GamificationRepo {
  return createPgGamificationRepo(client);
}

function attemptInput(overrides: Partial<GamiAttemptInput> = {}): GamiAttemptInput {
  return {
    id: uuidLike(101),
    userId: ALI_ID,
    simId: "pulse",
    attemptNo: 1,
    startedAt: D1,
    finishedAt: D1 + HOUR,
    score: 80,
    maxScore: 100,
    passed: true,
    summary: { "pulse.score": 80 },
    createdAt: FIXED_NOW,
    institutionId: INSTITUTION_ID,
    mode: "assessment",
    caseCount: 10,
    hintsUsed: 0,
    ...overrides,
  };
}

interface ProfileRow {
  readonly xp: number;
  readonly level: number;
  readonly streak_current: number;
  readonly streak_best: number;
  readonly last_date: string | null;
}

async function profileOf(userId: string, simId = "pulse"): Promise<ProfileRow | undefined> {
  const result = await client.query(
    "select xp, level, streak_current, streak_best, streak_last_date::text as last_date from gami_profiles where user_id = $1 and sim_id = $2",
    [userId, simId],
  );
  return result.rows[0] as ProfileRow | undefined;
}

async function attemptCount(): Promise<number> {
  const result = await client.query("select count(*)::int as count from gami_attempts");
  return (result.rows[0] as { readonly count: number }).count;
}

async function badgeKeys(userId: string): Promise<readonly string[]> {
  const result = await client.query(
    "select badge_key from gami_badges where user_id = $1 and sim_id = 'pulse' order by badge_key",
    [userId],
  );
  return (result.rows as readonly { readonly badge_key: string }[]).map((row) => row.badge_key);
}

function leaderboardQuery(userId: string) {
  return {
    userId,
    institutionId: INSTITUTION_ID,
    simId: "pulse" as const,
    period: "academic_year" as const,
    cohort: "all" as const,
    page: 1,
    pageSize: 50,
    at: FIXED_NOW,
  };
}

async function seedProfiles(): Promise<void> {
  const xpValues: readonly (readonly [string, number])[] = [
    [ALI_ID, 660],
    [MERT_ID, 500],
    [BORA_ID, 400],
  ];
  for (const [userId, xp] of xpValues) {
    await client.query("insert into gami_profiles (user_id, sim_id, xp, level) values ($1, 'pulse', $2, $3)", [
      userId,
      xp,
      levelForXpClosedForm(xp),
    ]);
  }
}

if (databaseUrl === "") {
  describe("oyunlaştırma SQL'i (yerel PostgreSQL)", () => {
    it.skip("DATABASE_URL tanımlı değil; DB turu atlandı", () => {});
  });
} else {
  describe("oyunlaştırma SQL'i (yerel PostgreSQL)", () => {
    beforeAll(async () => {
      client = await connectToSchema(SCHEMA);
    });

    afterAll(async () => {
      await closeSchema(client, SCHEMA);
    });

    beforeEach(async () => {
      await resetDatabase(client);
      await insertInstitution(client);
      await insertUser(client, { id: ALI_ID, username: "ali.veli", displayName: "Ali Veli", actorId: "ali.veli-0001" });
      await insertUser(client, { id: MERT_ID, username: "mert.ikinci", displayName: "Mert İkinci", actorId: "mert.ikinci-0002" });
      await insertUser(client, { id: BORA_ID, username: "bora.ucuncu", displayName: "Bora Üçüncü", actorId: "bora.ucuncu-0003" });
    });

    describe("writeAttempt: deneme + profil tek ifadede (API-05)", () => {
      it("assessment 10 vaka 80 puan: 120 XP ve düzey kapalı formla eşit", async () => {
        const result = await repo().writeAttempt(
          attemptInput({ mode: "assessment", caseCount: 10, hintsUsed: 0, score: 80, maxScore: 100, passed: true }),
        );
        expect(result.kind).toBe("created");
        const profile = await profileOf(ALI_ID);
        expect(profile?.xp).toBe(120);
        expect(profile?.level).toBe(levelForXpClosedForm(120));
        expect(profile?.level).toBe(levelForXp(120, DEFAULT_RULES).level);
        expect(await attemptCount()).toBe(1);
      });

      it("practice 5 vaka 5 ipucu (ustalık yok): 15 XP", async () => {
        await repo().writeAttempt(
          attemptInput({ mode: "practice", caseCount: 5, hintsUsed: 5, score: 50, maxScore: 100, passed: false }),
        );
        expect((await profileOf(ALI_ID))?.xp).toBe(15);
      });

      it("biriken XP'de düzey her adımda sunucu formülü ve kapalı formla aynıdır", async () => {
        const steps: readonly Partial<GamiAttemptInput>[] = [
          { mode: "assessment", caseCount: 10, score: 80, maxScore: 100, passed: true },
          { mode: "assessment", caseCount: 10, score: 50, maxScore: 100, passed: false },
          { mode: "assessment", caseCount: 10, score: 80, maxScore: 100, passed: true },
          { mode: "practice", caseCount: 10, hintsUsed: 0, passed: true },
          { mode: "assessment", caseCount: 20, score: 100, maxScore: 100, passed: true },
        ];
        let expectedXp = 0;
        for (const [index, step] of steps.entries()) {
          const input = attemptInput({ ...step, id: uuidLike(200 + index), attemptNo: index + 1 });
          expect((await repo().writeAttempt(input)).kind, `adım ${index}`).toBe("created");
          expectedXp += serverAttemptXp(input);
          const profile = await profileOf(ALI_ID);
          expect(profile?.xp, `adım ${index}`).toBe(expectedXp);
          expect(profile?.level, `adım ${index}`).toBe(levelForXpClosedForm(expectedXp));
          expect(profile?.level, `adım ${index}`).toBe(levelForXp(expectedXp, DEFAULT_RULES).level);
        }
        expect(expectedXp).toBe(660);
      });

      it("seri: ardışık gün +1, boşlukta 1, geç gelen eski gün etkisiz", async () => {
        const days: readonly string[] = ["2026-09-20", "2026-09-21", "2026-09-19", "2026-09-24", "2026-09-24"];
        const expected: readonly string[] = [
          "1/1/2026-09-20",
          "2/2/2026-09-21",
          "2/2/2026-09-21",
          "1/2/2026-09-24",
          "1/2/2026-09-24",
        ];
        for (const [index, day] of days.entries()) {
          const finishedAt = Date.parse(`${day}T09:00:00.000Z`);
          await repo().writeAttempt(
            attemptInput({ id: uuidLike(300 + index), attemptNo: index + 1, startedAt: finishedAt - HOUR, finishedAt }),
          );
          const profile = await profileOf(ALI_ID);
          expect(
            `${profile?.streak_current}/${profile?.streak_best}/${profile?.last_date}`,
            `gün ${day}`,
          ).toBe(expected[index]);
        }
      });

      it("idempotent tekrar XP'yi çoğaltmaz; başka sim/kullanıcı kimliği 409", async () => {
        const input = attemptInput();
        expect((await repo().writeAttempt(input)).kind).toBe("created");
        const afterFirst = await profileOf(ALI_ID);
        expect((await repo().writeAttempt(input)).kind).toBe("existing");
        expect((await profileOf(ALI_ID))?.xp).toBe(afterFirst?.xp);
        expect(await attemptCount()).toBe(1);

        expect((await repo().writeAttempt({ ...input, userId: MERT_ID })).kind).toBe("conflict");
        expect((await repo().writeAttempt({ ...input, simId: "ausculta" })).kind).toBe("conflict");
        expect((await repo().writeAttempt({ ...input, id: uuidLike(999) })).kind).toBe("conflict");
        expect(await attemptCount()).toBe(1);
        const auscultaProfiles = await client.query(
          "select count(*)::int as count from gami_profiles where sim_id = 'ausculta'",
        );
        expect((auscultaProfiles.rows[0] as { readonly count: number }).count).toBe(0);
      });

      it("maxScore = 0 şema check'ine takılmadan invalid döner; satır yazılmaz", async () => {
        expect((await repo().writeAttempt(attemptInput({ maxScore: 0, score: 0 }))).kind).toBe("invalid");
        expect(await attemptCount()).toBe(0);
        expect(await profileOf(ALI_ID)).toBeUndefined();
      });
    });

    describe("rozet değerlendirmesi (ADR-008)", () => {
      it("Pulse özetinden rhythm-streak-3/10, mode-af ve twelve-leads verilir; caliper yok", async () => {
        const summary = encodePulseSummary({
          score: 90,
          extra: {
            ecgMode: "af",
            modeMastered: true,
            correctlyReadLeads: 12,
            caliperAccurate: null,
            rhythmRecognitionStreak: 10,
          },
        });
        const result = await repo().writeAttempt(attemptInput({ userId: ALI_ID, summary, score: 90 }));
        expect(result.kind).toBe("created");
        expect(await badgeKeys(ALI_ID)).toEqual([
          "mode-af",
          "rhythm-streak-10",
          "rhythm-streak-3",
          "twelve-leads",
        ]);
      });

      it("tekrar deneme rozetleri çoğaltmaz", async () => {
        const summary = encodePulseSummary({
          score: 90,
          extra: {
            ecgMode: "af",
            modeMastered: true,
            correctlyReadLeads: 3,
            caliperAccurate: null,
            rhythmRecognitionStreak: 4,
          },
        });
        const input = attemptInput({ userId: ALI_ID, summary, score: 90 });
        expect((await repo().writeAttempt(input)).kind).toBe("created");
        const before = await badgeKeys(ALI_ID);
        expect(before).toContain("mode-af");
        expect((await repo().writeAttempt(input)).kind).toBe("existing");
        expect(await badgeKeys(ALI_ID)).toEqual(before);
        expect(before.filter((key) => key === "mode-af")).toHaveLength(1);
      });

      it("caliper-1 üç doğru ölçüm tamamlanmadan verilmez", async () => {
        for (let index = 0; index < 3; index += 1) {
          const summary = encodePulseSummary({
            score: 70,
            extra: {
              ecgMode: "normal",
              modeMastered: false,
              correctlyReadLeads: 1,
              caliperAccurate: true,
              rhythmRecognitionStreak: 1,
            },
          });
          const finishedAt = D1 + index * DAY;
          await repo().writeAttempt(
            attemptInput({
              userId: BORA_ID,
              id: uuidLike(400 + index),
              attemptNo: index + 1,
              startedAt: finishedAt - HOUR,
              finishedAt,
              summary,
            }),
          );
          const keys = await badgeKeys(BORA_ID);
          if (index < 2) {
            expect(keys, `${index + 1} ölçüm`).not.toContain("caliper-1");
          } else {
            expect(keys, "3 ölçüm").toEqual(["caliper-1"]);
          }
        }
      });
    });

    describe("liderlik katılım tercihi (T100)", () => {
      it("setPreferences false: başkasının toplamı 1 azalır; kişi kendi satırını görür", async () => {
        await seedProfiles();
        expect(await repo().getPreferences(ALI_ID)).toEqual({ leaderboardVisible: true });

        const before = await repo().getLeaderboard(leaderboardQuery(MERT_ID));
        expect(before.total).toBe(3);

        expect(await repo().setPreferences(ALI_ID, { leaderboardVisible: false }, FIXED_NOW)).toEqual({
          leaderboardVisible: false,
        });
        expect(await repo().getPreferences(ALI_ID)).toEqual({ leaderboardVisible: false });

        const after = await repo().getLeaderboard(leaderboardQuery(MERT_ID));
        expect(after.total).toBe(before.total - 1);
        const names = after.rows.map((row) => row.displayName);
        expect(names).not.toContain("AV");
        expect(names).toContain("Mİ");

        const own = await repo().getLeaderboard(leaderboardQuery(ALI_ID));
        expect(own.total).toBe(3);
        expect(own.rows.some((row) => row.isMe)).toBe(true);

        await repo().setPreferences(ALI_ID, { leaderboardVisible: true }, FIXED_NOW);
        expect((await repo().getLeaderboard(leaderboardQuery(MERT_ID))).total).toBe(3);
      });
    });
  });
}
