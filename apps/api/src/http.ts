import type { Context } from "hono";
import { statusForErrorCode, type ErrorCode, type ErrorResponse, type SimId } from "@egemed/contracts";
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

/**
 * T67 — `/me/*` uçlarının oturum sahibi. Kimlik yalnız çerezdeki oturumdan
 * çözülür; yol veya gövde parametresiyle başka kullanıcı istenemez.
 */
export interface MeActor {
  readonly userId: string;
  readonly institutionId: string;
  /** Oturumdaki kullanıcının erişebildiği simler; her istekte DB'den (API-03). */
  readonly simAccess: readonly SimId[];
  /** Oyunlaştırmaya katılım (öğretim üyesi ve uzmanlık öğrencisi katılmaz, 28 Eyl 2026). */
  readonly gamified: boolean;
}

/** İstek bağlamı: ara katman üretilen/doğrulanan `request_id`yi ve aktör kimliğini buraya yazar. */
export interface AppEnv {
  Variables: {
    requestId: string;
    adminActor: AdminActor;
    meActor: MeActor;
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
