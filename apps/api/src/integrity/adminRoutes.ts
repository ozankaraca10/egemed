import type { Hono } from "hono";
import { z } from "zod";
import { pageSizeSchema } from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import { toIstanbulIso } from "../admin/users";
import type { IntegrityFlagListItem, IntegrityRepo } from "./repo";

/**
 * T283a — `GET /admin/integrity`: yalnız tespit ve işaretleme okuması (plan §5).
 * Karar uçları (clear/confirm) YOK; T283b ekler. `/admin/*` ara katmanı
 * (csrfGuard + requireAdmin) `registerAdminUserRoutes` içinde kaydedildiği için
 * bu rota ondan SONRA bağlanmalıdır (bkz. `app.ts`). Liste kurum kapsamlıdır
 * (`adminActor.institutionId`); ham öğrenci verisi ya da sır dönmez.
 */

export const integrityListQuerySchema = z.object({
  status: z.enum(["pending", "cleared", "confirmed"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: pageSizeSchema.optional(),
});

export const DEFAULT_INTEGRITY_PAGE_SIZE = 20;

function integrityRowBody(row: IntegrityFlagListItem) {
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
  };
}

export function registerAdminIntegrityRoutes(app: Hono<AppEnv>, integrity: IntegrityRepo): void {
  app.get("/admin/integrity", async (c) => {
    const parsed = integrityListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? DEFAULT_INTEGRITY_PAGE_SIZE;
    const result = await integrity.list({
      institutionId: c.get("adminActor").institutionId,
      ...(parsed.data.status === undefined ? {} : { status: parsed.data.status }),
      page,
      pageSize,
    });
    return c.json({ data: result.rows.map(integrityRowBody), meta: { page, pageSize, total: result.total } });
  });
}
