import type { Context } from "hono";
import { statusForErrorCode, type ErrorCode, type ErrorResponse } from "@egemed/contracts";
import type { z } from "zod";

/**
 * T63 — ortak HTTP yardımcıları. Hata yanıtı tek biçimdir
 * (`{ error: { code, details? } }`); `request_id` ara katman tarafından
 * bağlama yazılır ve oturum audit kayıtları oradan okur.
 */

/** İstek bağlamı: ara katman üretilen/doğrulanan `request_id`yi buraya yazar. */
export interface AppEnv {
  Variables: {
    requestId: string;
  };
}

export function errorBody(code: ErrorCode, details?: unknown): ErrorResponse {
  return details === undefined ? { error: { code } } : { error: { code, details } };
}

/** Doğrulama ayrıntısı: yol ve kod raporlanır, gelen değer yanıta yazılmaz. */
export function validationDetails(error: z.ZodError): unknown {
  return {
    issues: error.issues.map((issue) => ({ code: issue.code, path: issue.path.map(String) })),
  };
}

export function jsonError(c: Context<AppEnv>, code: ErrorCode, details?: unknown) {
  return c.json(errorBody(code, details), statusForErrorCode(code));
}
