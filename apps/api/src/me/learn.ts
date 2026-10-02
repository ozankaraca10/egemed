import type { Context, Hono } from "hono";
import { SIM_IDS, learnCompleteRequestSchema, simIdSchema, type SimId } from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { toIstanbulIso } from "../admin/users";

/**
 * Öğrenme tamamlama kaydı (depo sahibi kararı, 27 Eylül 2026): üç simde de
 * öğrenme modu bitmeden uygulama/değerlendirme ve meydan okuma kilitlidir.
 * "Öğrenme bitti" tespitini sim paketleri yapar; bu modül yalnız kaydı tutar:
 * - `GET /me/learn` üç simin AYRI durumunu döner (birleşik gösterge üretilmez).
 * - `POST /me/sims/:simId/learn/complete` erişimi olan sim için kaydı yazar;
 *   ilk `completed_at` korunur, `content_version` güncellenir (011).
 * Tüm sorgular parametrelidir; `Date.now()` kullanılmaz, zaman enjekte edilir.
 */

export interface LearnRecord {
  readonly userId: string;
  readonly simId: SimId;
  readonly completedAt: number;
  readonly contentVersion: string;
}

export interface LearnRepo {
  /** Kullanıcının tamamladığı simler; kaydı olmayan sim tamamlanmamıştır. */
  list(userId: string): Promise<readonly LearnRecord[]>;
  /** İlk `completedAt` korunur, `contentVersion` güncellenir. */
  upsert(record: LearnRecord): Promise<LearnRecord>;
}

interface LearnDeps {
  readonly learn: LearnRepo;
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/** Üç simin durumu: kaydı olmayan sim `complete: false` ve `completedAt: null` taşır. */
function learnStatusBody(records: readonly LearnRecord[]) {
  const bySim = new Map(records.map((record) => [record.simId, record]));
  return {
    sims: Object.fromEntries(
      SIM_IDS.map((simId) => {
        const record = bySim.get(simId);
        return [
          simId,
          record === undefined
            ? { complete: false, completedAt: null }
            : { complete: true, completedAt: toIstanbulIso(record.completedAt) },
        ];
      }),
    ),
  };
}

/**
 * Öğrenme kilidi ortak kontrolü (27 Eyl 2026 Meydan Okuma, T290 uygulama/
 * değerlendirme oturumu): ilgili simin tamamlama kaydı var mı?
 */
export async function hasCompletedLearn(learn: LearnRepo, userId: string, simId: SimId): Promise<boolean> {
  return (await learn.list(userId)).some((record) => record.simId === simId);
}

/** Öğrenme kilidi ihlali: 403 `forbidden` + `learn_required` (Meydan Okuma ile aynı biçim). */
export function learnRequiredError(c: Context<AppEnv>) {
  return jsonError(c, "forbidden", { issues: [{ code: "learn_required" }] });
}

/** `/me/*` ara katmanından (oturum + CSRF, `meActor`) SONRA kaydedilmelidir. */
export function registerLearnRoutes(app: Hono<AppEnv>, deps: LearnDeps, now: () => number): void {
  app.get("/me/learn", async (c) => {
    const records = await deps.learn.list(c.get("meActor").userId);
    return c.json({ data: learnStatusBody(records) });
  });

  app.post("/me/sims/:simId/learn/complete", async (c) => {
    const simId = simIdSchema.safeParse(c.req.param("simId"));
    if (!simId.success) return jsonError(c, "not_found");
    const actor = c.get("meActor");
    // Sim erişimi olmayan kullanıcı kayıt yazamaz (API-03).
    if (!actor.simAccess.includes(simId.data)) return jsonError(c, "forbidden");
    const parsed = learnCompleteRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    await deps.learn.upsert({
      userId: actor.userId,
      simId: simId.data,
      completedAt: now(),
      contentVersion: parsed.data.contentVersion,
    });
    const records = await deps.learn.list(actor.userId);
    return c.json({ data: learnStatusBody(records) });
  });
}

// --- Depolar -------------------------------------------------------------------

interface LearnDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

interface PgLearnRow {
  readonly user_id: string;
  readonly sim_id: SimId;
  readonly completed_at: Date;
  readonly content_version: string;
}

function fromRow(row: PgLearnRow): LearnRecord {
  return {
    userId: row.user_id,
    simId: row.sim_id,
    completedAt: row.completed_at.getTime(),
    contentVersion: row.content_version,
  };
}

export function createPgLearnRepo(db: LearnDb): LearnRepo {
  return {
    async list(userId) {
      const result = await db.query(
        "select user_id, sim_id, completed_at, content_version from sim_learn_completions where user_id = $1",
        [userId],
      );
      return (result.rows as readonly PgLearnRow[]).map(fromRow);
    },
    async upsert(record) {
      // Çakışmada yalnız sürüm güncellenir; ilk `completed_at` korunur.
      const result = await db.query(
        `insert into sim_learn_completions (user_id, sim_id, completed_at, content_version)
         values ($1, $2, $3, $4)
         on conflict (user_id, sim_id) do update set content_version = excluded.content_version
         returning user_id, sim_id, completed_at, content_version`,
        [record.userId, record.simId, new Date(record.completedAt), record.contentVersion],
      );
      const row = result.rows[0] as PgLearnRow | undefined;
      return row === undefined ? record : fromRow(row);
    },
  };
}

/** Testler ve DB'siz geliştirme için bellek deposu (kayıtlar kullanıcı×sim anahtarıyla). */
export function createMemoryLearnRepo(): LearnRepo & { readonly records: Map<string, LearnRecord> } {
  const records = new Map<string, LearnRecord>();
  return {
    records,
    async list(userId) {
      return [...records.values()].filter((record) => record.userId === userId);
    },
    async upsert(record) {
      const key = `${record.userId}:${record.simId}`;
      const existing = records.get(key);
      const next: LearnRecord = existing === undefined ? { ...record } : { ...record, completedAt: existing.completedAt };
      records.set(key, next);
      return { ...next };
    },
  };
}
