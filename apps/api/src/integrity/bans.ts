import type { IntegrityUserLookup } from "./repo";

/**
 * T283b (ADR-009 §6 karar ucu, migration `016_competition_bans.sql`): yönetici
 * "confirmed" kararıyla açılan rekabet engeli. Otomatik ceza YOK — bu depo
 * yalnız admin karar ucundan (`decide` → `confirmed`) ve kaldırma ucundan
 * yazılır. Kullanıcı başına tek AKTİF engel (kısmi benzersiz dizin,
 * `lifted_at is null`); `open` ikinci kez çağrılırsa yok sayılır (idempotent).
 * Etkiler: Meydan Okuma oluşturma/katılma, liderlik + aylık ödül adaylığı,
 * değerlendirme/düello XP'si bu depoyu okur (sırasıyla `me/challenges.ts`,
 * `me/gamification.ts`, `me/simSessions.ts`).
 */

interface CompetitionBanRecord {
  readonly id: string;
  readonly userId: string;
  readonly flagId: string | null;
  readonly createdBy: string | null;
  readonly createdAt: number;
  readonly liftedAt: number | null;
  readonly liftedBy: string | null;
}

export interface CompetitionBanOpenInput {
  readonly id: string;
  readonly userId: string;
  readonly flagId: string | null;
  readonly createdBy: string;
  readonly at: number;
}

export interface CompetitionBansRepo {
  /** `confirmed` kararında çağrılır; aktif engel zaten varsa yok sayılır. */
  open(input: CompetitionBanOpenInput): Promise<void>;
  /** Aktif engeli kaldırır; aktif engel yoksa `false`. */
  lift(userId: string, liftedBy: string, at: number): Promise<boolean>;
  isActive(userId: string): Promise<boolean>;
  /** Kurum kapsamında aktif engelli kullanıcı kimlikleri (liderlik/ödül/admin listesi süzgeci). */
  activeUserIds(institutionId: string): Promise<ReadonlySet<string>>;
}

interface CompetitionBansDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

export function createPgCompetitionBansRepo(db: CompetitionBansDb): CompetitionBansRepo {
  return {
    async open(input) {
      await db.query(
        `insert into competition_bans (id, user_id, flag_id, created_by, created_at)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id) where lifted_at is null do nothing`,
        [input.id, input.userId, input.flagId, input.createdBy, new Date(input.at)],
      );
    },
    async lift(userId, liftedBy, at) {
      const result = await db.query(
        "update competition_bans set lifted_at = $2, lifted_by = $3 where user_id = $1 and lifted_at is null returning id",
        [userId, new Date(at), liftedBy],
      );
      return result.rows.length === 1;
    },
    async isActive(userId) {
      const result = await db.query("select 1 from competition_bans where user_id = $1 and lifted_at is null limit 1", [userId]);
      return result.rows.length === 1;
    },
    async activeUserIds(institutionId) {
      const result = await db.query(
        `select cb.user_id::text as user_id from competition_bans cb
         join users u on u.id = cb.user_id
         where cb.lifted_at is null and u.institution_id = $1`,
        [institutionId],
      );
      return new Set((result.rows as readonly { readonly user_id: string }[]).map((row) => row.user_id));
    },
  };
}

/** Bellek deposu: testler ve DB'siz geliştirme (yalnız test/dev; üretim `createPgCompetitionBansRepo` kullanır). */
export function createMemoryCompetitionBansRepo(
  lookupUser: IntegrityUserLookup,
): CompetitionBansRepo & { readonly rows: readonly CompetitionBanRecord[] } {
  const rows: CompetitionBanRecord[] = [];
  return {
    rows,
    async open(input) {
      if (rows.some((row) => row.userId === input.userId && row.liftedAt === null)) return;
      rows.push({
        id: input.id,
        userId: input.userId,
        flagId: input.flagId,
        createdBy: input.createdBy,
        createdAt: input.at,
        liftedAt: null,
        liftedBy: null,
      });
    },
    async lift(userId, liftedBy, at) {
      const active = rows.find((row) => row.userId === userId && row.liftedAt === null);
      if (active === undefined) return false;
      rows[rows.indexOf(active)] = { ...active, liftedAt: at, liftedBy };
      return true;
    },
    async isActive(userId) {
      return rows.some((row) => row.userId === userId && row.liftedAt === null);
    },
    async activeUserIds(institutionId) {
      const active = rows.filter((row) => row.liftedAt === null);
      const resolved = await Promise.all(active.map(async (row) => ({ userId: row.userId, user: await lookupUser(row.userId) })));
      return new Set(
        resolved.filter((entry) => entry.user !== null && entry.user.institutionId === institutionId).map((entry) => entry.userId),
      );
    },
  };
}
