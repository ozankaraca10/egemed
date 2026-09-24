import type { Context } from "hono";
import { statusForErrorCode, type ErrorCode, type ErrorResponse } from "@egemed/contracts";
import type { z } from "zod";

/**
 * T63 — ortak HTTP yardımcıları. Hata yanıtı tek biçimdir
 * (`{ error: { code, details? } }`); `request_id` ara katman tarafından
 * bağlama yazılır ve oturum audit kayıtları oradan okur.
 */

/**
 * T65 — admin uçlarının istek başına yeniden doğruladığı kimlik (E3 §b kural 3).
 * Rol çerezde önbelleklenmez; her istekte sunucuda okunur.
 */
export interface AdminActor {
  readonly userId: string;
  readonly institutionId: string;
}

/** İstek bağlamı: ara katman üretilen/doğrulanan `request_id`yi ve admin kimliğini buraya yazar. */
export interface AppEnv {
  Variables: {
    requestId: string;
    adminActor: AdminActor;
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
