import type { Hono } from "hono";
import { z } from "zod";
import { CODE_PATTERN, isoDateTimeSchema, pageSizeSchema, uuidSchema } from "@egemed/contracts";
import { jsonError, validationDetails, type AppEnv } from "../http";
import type { AuditListRow } from "../auth/repo";
import type { AuthDeps } from "../auth/routes";
import { toIstanbulIso } from "./users";

/**
 * T67 — `GET /admin/audit` (E3 §d): salt okunur denetim günlüğü. Yalnız admin
 * erişir (`/admin/*` ara katmanı) ve kayıtlar aktörün kurumuyla sınırlıdır;
 * filtreler (`actorId`, `action`, `targetType`, `targetId`, `from`, `to`) ve
 * sayfalama sunucuda uygulanır. Yanıt yalnız kodlu özet taşır; ham öğrenci
 * verisi, sır ve belirteç dönmez. Tüm sorgular parametrelidir.
 *
 * Bu dosyanın rotası `/admin/*` ara katmanına (csrfGuard + requireAdmin)
 * güvenen `registerAdminUserRoutes` çağrısından SONRA kaydedilmelidir.
 */

export const auditListQuerySchema = z.object({
  actorId: uuidSchema.optional(),
  action: z.string().regex(CODE_PATTERN).optional(),
  targetType: z.string().regex(CODE_PATTERN).optional(),
  targetId: uuidSchema.optional(),
  /** Kapsayıcı sınırlar; ofsetli ISO 8601 (E3 §d). */
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: pageSizeSchema.optional(),
});

export const DEFAULT_AUDIT_PAGE_SIZE = 20;

/** Liste satırı gövdesi: zaman Europe/Istanbul ofsetli ISO 8601'dir. */
function auditRowBody(row: AuditListRow) {
  return {
    id: row.id,
    occurredAt: toIstanbulIso(row.occurredAt),
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    summaryBefore: row.summaryBefore,
    summaryAfter: row.summaryAfter,
    requestId: row.requestId,
  };
}

export function registerAdminAuditRoutes(app: Hono<AppEnv>, deps: AuthDeps): void {
  app.get("/admin/audit", async (c) => {
    const parsed = auditListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) return jsonError(c, "invalid_request", validationDetails(parsed.error));
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? DEFAULT_AUDIT_PAGE_SIZE;
    const result = await deps.audit.list({
      institutionId: c.get("adminActor").institutionId,
      actorId: parsed.data.actorId,
      action: parsed.data.action,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      from: parsed.data.from === undefined ? undefined : new Date(parsed.data.from).getTime(),
      to: parsed.data.to === undefined ? undefined : new Date(parsed.data.to).getTime(),
      page,
      pageSize,
    });
    return c.json({
      data: result.rows.map(auditRowBody),
      meta: { page, pageSize, total: result.total },
    });
  });
}
