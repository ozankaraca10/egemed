import type { SimId, SimSessionMode } from "@egemed/contracts";
import type { IntegrityFlagSignals } from "./signals";

/**
 * T283a — `integrity_flags` deposu (migration 015). Bu görevde yalnız YAZMA
 * (oturum bitişinde eşik aşılırsa) ve OKUMA (`GET /admin/integrity`) vardır;
 * karar uçları (clear/confirm) T283b'de eklenir, `status` burada hep
 * `'pending'` yazılır.
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

export interface IntegrityRepo {
  write(input: IntegrityFlagInput): Promise<void>;
  list(query: IntegrityFlagListQuery): Promise<{ readonly rows: readonly IntegrityFlagListItem[]; readonly total: number }>;
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
  };
}

/** Kullanıcının kurumu ve görünen adı; PG'de JOIN, bellekte bu işlev enjekte edilir. */
export type IntegrityUserLookup = (userId: string) => Promise<{ readonly institutionId: string; readonly displayName: string } | null>;

/** Bellek deposu: testler ve DB'siz geliştirme (yalnız test/dev; üretim `createPgIntegrityRepo` kullanır). */
export function createMemoryIntegrityRepo(lookupUser: IntegrityUserLookup): IntegrityRepo & { readonly rows: readonly IntegrityFlagInput[] } {
  const rows: IntegrityFlagInput[] = [];
  return {
    rows,
    async write(input) {
      rows.push(input);
    },
    async list({ institutionId, status, page, pageSize }) {
      // Bu görevde karar uçları yok; yazılan tüm satırlar 'pending' kalır (plan §5).
      if (status !== undefined && status !== "pending") return { rows: [], total: 0 };
      const resolved = await Promise.all(rows.map(async (row) => ({ row, user: await lookupUser(row.userId) })));
      const matched = resolved
        .filter((entry): entry is { row: IntegrityFlagInput; user: { institutionId: string; displayName: string } } => entry.user !== null && entry.user.institutionId === institutionId)
        .sort((a, b) => b.row.createdAt - a.row.createdAt);
      const start = (page - 1) * pageSize;
      return {
        rows: matched.slice(start, start + pageSize).map(({ row, user }) => ({
          id: row.id,
          sessionId: row.sessionId,
          simId: row.simId,
          mode: row.mode,
          score: row.score,
          signals: row.signals,
          status: "pending" as const,
          createdAt: row.createdAt,
          userId: row.userId,
          displayName: user.displayName,
        })),
        total: matched.length,
      };
    },
  };
}
