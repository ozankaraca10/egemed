import type { Context, Hono } from "hono";
import { z } from "zod";
import { integrityDecisionRequestSchema, pageSizeSchema, uuidSchema } from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { insertAdminAudit, toIstanbulIso } from "../admin/users";
import type { AuthDeps } from "../auth/routes";
import type { CompetitionBansRepo } from "./bans";
import type { IntegrityFlagListItem, IntegrityRepo } from "./repo";

/**
 * T283a/T283b — `/admin/integrity*`: tespit/işaretleme okuması (`GET`), yönetici
 * karar ucu (`POST /:flagId/decision`) ve engel kaldırma (`POST /bans/:userId/lift`).
 * Otomatik ceza YOK: rekabet engeli yalnız `confirmed` kararıyla açılır (ADR-009 §6,
 * `../bans.ts`). `/admin/*` ara katmanı (csrfGuard + requireAdmin)
 * `registerAdminUserRoutes` içinde kaydedildiği için bu rotalar ondan SONRA
 * bağlanmalıdır (bkz. `app.ts`). Liste/karar kurum kapsamlıdır
 * (`adminActor.institutionId`); başka kurumun işareti `not_found` döner.
 */

interface IntegrityAdminDeps {
  readonly integrity: IntegrityRepo;
  readonly bans: CompetitionBansRepo;
  readonly auth: AuthDeps;
  /** Engel kaydı kimliği (uuid); admin akışındaki aynı üretici (`AdminDeps.newId`). */
  readonly newId: () => string;
}

const integrityListQuerySchema = z.object({
  status: z.enum(["pending", "cleared", "confirmed"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: pageSizeSchema.optional(),
});

const DEFAULT_INTEGRITY_PAGE_SIZE = 20;

function integrityRowBody(row: IntegrityFlagListItem, banned: boolean) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    simId: row.simId,
    mode: row.mode,
    score: row.score,
    signals: row.signals,
    status: row.status,
    createdAt: toIstanbulIso(row.createdAt),
    userId: row.userId,
    displayName: row.displayName,
    // T283b: kullanıcının AKTİF rekabet engeli durumu (yalnız yönetici kararıyla açılır).
    banned,
  };
}

function readJson(c: Context<AppEnv>): Promise<unknown> {
  return c.req.json().catch(() => null);
}

export function registerAdminIntegrityRoutes(app: Hono<AppEnv>, deps: IntegrityAdminDeps, now: () => number): void {
  app.get("/admin/integrity", async (c) => {
    const parsed = integrityListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? DEFAULT_INTEGRITY_PAGE_SIZE;
    const institutionId = c.get("adminActor").institutionId;
    const result = await deps.integrity.list({
      institutionId,
      ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
      page,
      pageSize,
    });
    const banned = await deps.bans.activeUserIds(institutionId);
    return c.json({
      data: result.rows.map((row) => integrityRowBody(row, banned.has(row.userId))),
      meta: { page, pageSize, total: result.total },
    });
  });

  /** Yönetici karar ucu (ADR-009 §6): `pending` değilse 409; `confirmed` rekabet engeli açar. */
  app.post("/admin/integrity/:flagId/decision", async (c) => {
    const flagId = uuidSchema.safeParse(c.req.param("flagId"));
    if (!flagId.success) return jsonError(c, "not_found");
    const parsed = integrityDecisionRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const actor = c.get("adminActor");
    const at = now();
    const result = await deps.integrity.decide({
      flagId: flagId.data,
      institutionId: actor.institutionId,
      decision: parsed.data.decision,
      note: parsed.data.note ?? null,
      reviewedBy: actor.userId,
      at,
    });
    if (result.outcome === "not_found") return jsonError(c, "not_found");
    if (result.outcome === "conflict") return jsonError(c, "conflict");
    if (parsed.data.decision === "confirmed") {
      await deps.bans.open({ id: deps.newId(), userId: result.flag.userId, flagId: flagId.data, createdBy: actor.userId, at });
    }
    await insertAdminAudit(deps, c, at, {
      action: "integrity.decision",
      targetType: "integrity_flag",
      targetId: flagId.data,
      summaryAfter: { decision: parsed.data.decision },
    });
    const banned = await deps.bans.isActive(result.flag.userId);
    return c.json({ data: { id: result.flag.id, status: result.flag.status, reviewedAt: toIstanbulIso(at), note: parsed.data.note ?? null, banned } });
  });

  /** Rekabet engelini kaldırır; aktif engel yoksa (ya da başka kurumun kullanıcısıysa) 404. */
  app.post("/admin/integrity/bans/:userId/lift", async (c) => {
    const userId = uuidSchema.safeParse(c.req.param("userId"));
    if (!userId.success) return jsonError(c, "not_found");
    const actor = c.get("adminActor");
    const context = await deps.auth.users.getMeContext(userId.data);
    if (context === null || context.institution.id !== actor.institutionId) return jsonError(c, "not_found");
    const at = now();
    const lifted = await deps.bans.lift(userId.data, actor.userId, at);
    if (!lifted) return jsonError(c, "not_found");
    await insertAdminAudit(deps, c, at, {
      action: "integrity.ban_lift",
      targetType: "user",
      targetId: userId.data,
      summaryAfter: { lifted: "true" },
    });
    return c.json({ data: { userId: userId.data, banned: false } });
  });
}
