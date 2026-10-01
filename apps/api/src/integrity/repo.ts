import type { SimId, SimSessionMode } from "@egemed/contracts";
import type { IntegrityFlagSignals } from "./signals";

/**
 * T283a/T283b — `integrity_flags` deposu (migration 015). YAZMA (oturum
 * bitişinde eşik aşılırsa, hep `'pending'`), OKUMA (`GET /admin/integrity`) ve
 * KARAR (`decide`: `POST /admin/integrity/:flagId/decision`) burada. Karar
 * yalnız `pending` işareti değiştirir; `confirmed` kararının rekabet engeli
 * açması `../integrity/bans.ts` + `adminRoutes.ts`'dedir (bu depo bunu bilmez).
 */

export type IntegrityFlagStatus = "pending" | "cleared" | "confirmed";

export interface IntegrityFlagInput {
  readonly id: string;
  readonly sessionId: string;
  readonly userId: string;
  readonly simId: SimId;
  readonly mode: SimSessionMode;
  readonly score: number;
  readonly signals: IntegrityFlagSignals;
  readonly createdAt: number;
}

export interface IntegrityFlagListItem {
  readonly id: string;
  readonly sessionId: string;
  readonly simId: SimId;
  readonly mode: SimSessionMode;
  readonly score: number;
  readonly signals: IntegrityFlagSignals;
  readonly status: IntegrityFlagStatus;
  readonly createdAt: number;
  readonly userId: string;
  readonly displayName: string;
}

export interface IntegrityFlagListQuery {
  readonly institutionId: string;
  readonly status?: IntegrityFlagStatus;
  readonly page: number;
  readonly pageSize: number;
}

/** T283b — yönetici karar ucu girdisi (`POST /admin/integrity/:flagId/decision`). */
export interface IntegrityDecisionInput {
  readonly flagId: string;
  readonly institutionId: string;
  readonly decision: "cleared" | "confirmed";
  readonly note: string | null;
  readonly reviewedBy: string;
  readonly at: number;
}

export interface IntegrityDecisionRecord {
  readonly id: string;
  readonly userId: string;
  readonly status: IntegrityFlagStatus;
}

export type IntegrityDecisionOutcome =
  | { readonly outcome: "ok"; readonly flag: IntegrityDecisionRecord }
  | { readonly outcome: "not_found"; readonly flag: null }
  | { readonly outcome: "conflict"; readonly flag: null };

export interface IntegrityRepo {
  write(input: IntegrityFlagInput): Promise<void>;
  list(query: IntegrityFlagListQuery): Promise<{ readonly rows: readonly IntegrityFlagListItem[]; readonly total: number }>;
  /** Yalnız `pending` işareti karara bağlar (409 kaynağı: `pending` değilse `conflict`); başka kurumun işareti `not_found`. */
  decide(input: IntegrityDecisionInput): Promise<IntegrityDecisionOutcome>;
}

export interface IntegrityDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

interface PgIntegrityFlagRow {
  readonly id: string;
  readonly session_id: string;
  readonly sim_id: SimId;
  readonly mode: SimSessionMode;
  readonly score: string | number;
  readonly signals: IntegrityFlagSignals;
  readonly status: IntegrityFlagStatus;
  readonly created_at: Date;
  readonly user_id: string;
  readonly display_name: string;
}

function toFlagListItem(row: PgIntegrityFlagRow): IntegrityFlagListItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    simId: row.sim_id,
    mode: row.mode,
    score: typeof row.score === "string" ? Number(row.score) : row.score,
    signals: row.signals,
    status: row.status,
    createdAt: row.created_at.getTime(),
    userId: row.user_id,
    displayName: row.display_name,
  };
}

export function createPgIntegrityRepo(db: IntegrityDb): IntegrityRepo {
  return {
    async write(input) {
      await db.query(
        `insert into integrity_flags (id, session_id, user_id, sim_id, mode, score, signals, status, created_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, 'pending', $8)`,
        [input.id, input.sessionId, input.userId, input.simId, input.mode, input.score, JSON.stringify(input.signals), new Date(input.createdAt)],
      );
    },
    async list({ institutionId, status, page, pageSize }) {
      const params: unknown[] = [institutionId];
      let where = "u.institution_id = $1";
      if (status !== undefined) {
        params.push(status);
        where += ` and f.status = $${params.length}`;
      }
      const totalResult = await db.query(
        `select count(*)::int as total from integrity_flags f join users u on u.id = f.user_id where ${where}`,
        params,
      );
      const totalRow = totalResult.rows[0] as { readonly total?: unknown } | undefined;
      const limitParam = params.length + 1;
      const offsetParam = params.length + 2;
      const rowsResult = await db.query(
        `select f.id::text as id, f.session_id::text as session_id, f.sim_id, f.mode, f.score, f.signals, f.status, f.created_at, f.user_id::text as user_id, u.display_name
         from integrity_flags f join users u on u.id = f.user_id
         where ${where}
         order by f.created_at desc, f.id desc
         limit $${limitParam} offset $${offsetParam}`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return {
        rows: rowsResult.rows.map((row) => toFlagListItem(row as PgIntegrityFlagRow)),
        total: typeof totalRow?.total === "number" ? totalRow.total : 0,
      };
    },
    async decide(input) {
      const existing = await db.query(
        `select f.status, f.user_id::text as user_id from integrity_flags f join users u on u.id = f.user_id where f.id = $1 and u.institution_id = $2`,
        [input.flagId, input.institutionId],
      );
      const existingRow = existing.rows[0] as { readonly status: IntegrityFlagStatus; readonly user_id: string } | undefined;
      if (existingRow === undefined) return { outcome: "not_found", flag: null };
      if (existingRow.status !== "pending") return { outcome: "conflict", flag: null };
      const updated = await db.query(
        `update integrity_flags set status = $2, reviewed_by = $3, reviewed_at = $4, note = $5
         where id = $1 and status = 'pending'
         returning id::text as id, user_id::text as user_id, status`,
        [input.flagId, input.decision, input.reviewedBy, new Date(input.at), input.note],
      );
      const updatedRow = updated.rows[0] as { readonly id: string; readonly user_id: string; readonly status: IntegrityFlagStatus } | undefined;
      // Çakışan eşzamanlı karar: ilk SELECT `pending` gördü ama UPDATE satır bulamadı.
      if (updatedRow === undefined) return { outcome: "conflict", flag: null };
      return { outcome: "ok", flag: { id: updatedRow.id, userId: updatedRow.user_id, status: updatedRow.status } };
    },
  };
}

/** Kullanıcının kurumu ve görünen adı; PG'de JOIN, bellekte bu işlev enjekte edilir. */
export type IntegrityUserLookup = (userId: string) => Promise<{ readonly institutionId: string; readonly displayName: string } | null>;

interface MemoryFlagDecision {
  readonly status: IntegrityFlagStatus;
  readonly reviewedBy: string;
  readonly reviewedAt: number;
  readonly note: string | null;
}

/** Bellek deposu: testler ve DB'siz geliştirme (yalnız test/dev; üretim `createPgIntegrityRepo` kullanır). */
export function createMemoryIntegrityRepo(lookupUser: IntegrityUserLookup): IntegrityRepo & { readonly rows: readonly IntegrityFlagInput[] } {
  const rows: IntegrityFlagInput[] = [];
  // T283b — karar ucu durumu yazım anındaki ham satırdan ayrı tutulur; `rows` testlerin
  // tespit anındaki ham kaydı okuduğu arayüzdür (bkz. integrity-flagging.test.ts), bu
  // yüzden karar bilgisiyle değiştirilmez.
  const decisions = new Map<string, MemoryFlagDecision>();
  return {
    rows,
    async write(input) {
      rows.push(input);
    },
    async list({ institutionId, status, page, pageSize }) {
      const resolved = await Promise.all(rows.map(async (row) => ({ row, user: await lookupUser(row.userId) })));
      const matched = resolved
        .filter((entry): entry is { row: IntegrityFlagInput; user: { institutionId: string; displayName: string } } => entry.user !== null && entry.user.institutionId === institutionId)
        .map((entry) => ({ ...entry, status: decisions.get(entry.row.id)?.status ?? ("pending" as const) }))
        .filter((entry) => status === undefined || entry.status === status)
        .sort((a, b) => b.row.createdAt - a.row.createdAt);
      const start = (page - 1) * pageSize;
      return {
        rows: matched.slice(start, start + pageSize).map(({ row, user, status: rowStatus }) => ({
          id: row.id,
          sessionId: row.sessionId,
          simId: row.simId,
          mode: row.mode,
          score: row.score,
          signals: row.signals,
          status: rowStatus,
          createdAt: row.createdAt,
          userId: row.userId,
          displayName: user.displayName,
        })),
        total: matched.length,
      };
    },
    async decide(input) {
      const row = rows.find((candidate) => candidate.id === input.flagId);
      if (row === undefined) return { outcome: "not_found", flag: null };
      const user = await lookupUser(row.userId);
      if (user === null || user.institutionId !== input.institutionId) return { outcome: "not_found", flag: null };
      const current = decisions.get(row.id)?.status ?? "pending";
      if (current !== "pending") return { outcome: "conflict", flag: null };
      decisions.set(row.id, { status: input.decision, reviewedBy: input.reviewedBy, reviewedAt: input.at, note: input.note });
      return { outcome: "ok", flag: { id: row.id, userId: row.userId, status: input.decision } };
    },
  };
}
