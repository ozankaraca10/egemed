import { z } from "zod";
import {
  authMethodSchema,
  displayNameSchema,
  emailSchema,
  hasMappingKey,
  pageSizeSchema,
  queryBooleanSchema,
  roleSchema,
  simIdListSchema,
  simIdSchema,
  userStatusSchema,
  usernameSchema,
  uuidSchema,
} from "./common";

/** POST /admin/users (E3 §d). `role: "admin"` biçimsel olarak geçerlidir;
 *  uç nokta yetki katmanında 403 `role_not_permitted` döner (E3 §b). */
export const createUserRequestSchema = z
  .strictObject({
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    displayName: displayNameSchema,
    authMethod: authMethodSchema,
    role: roleSchema,
    unitId: uuidSchema.optional(),
    simAccess: simIdListSchema.default([]),
  })
  .refine(hasMappingKey, { message: "mapping_key_required", path: ["username"] });

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/** PATCH /admin/users/:id: yalnız görünen ad, birim ve eşleme anahtarı;
 *  `sso_subject` ve rol düzenlenemez (rol ayrı uçlardan atanır). */
export const updateUserRequestSchema = z
  .strictObject({
    username: usernameSchema.nullable().optional(),
    email: emailSchema.nullable().optional(),
    displayName: displayNameSchema.optional(),
    unitId: uuidSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "empty_patch" })
  .refine(
    (value) => !("username" in value && "email" in value) || value.username != null || value.email != null,
    { message: "mapping_key_required", path: ["username"] },
  );

export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const USER_SORTS = ["displayName", "createdAt", "lastLoginAt"] as const;
export type UserSort = (typeof USER_SORTS)[number];

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/** GET /admin/users sorgu parametreleri (E3 §d). */
export const userListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  role: roleSchema.optional(),
  unitId: uuidSchema.optional(),
  status: userStatusSchema.optional(),
  authMethod: authMethodSchema.optional(),
  sort: z.enum(USER_SORTS).optional(),
  order: z.enum(SORT_ORDERS).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: pageSizeSchema.optional(),
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const BULK_OPERATIONS = [
  "assign_role",
  "revoke_role",
  "set_unit",
  "set_status",
  "grant_sim",
  "revoke_sim",
] as const;

export type BulkOperation = (typeof BULK_OPERATIONS)[number];

/** Toplu durum değişimi yalnız etkinleştir/askıya al; silme ayrı uçtadır (E3 §b). */
export const BULK_STATUSES = ["active", "suspended"] as const;

const bulkBase = { userIds: z.array(uuidSchema).min(1) };

/** POST /admin/users/bulk gövdesi (E3 §d). `assign_role`/`revoke_role` değeri
 *  `admin` olabilir; yetki katmanı 403 `role_not_permitted` döner. */
export const bulkRequestSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...bulkBase, operation: z.literal("assign_role"), value: roleSchema }),
  z.strictObject({ ...bulkBase, operation: z.literal("revoke_role"), value: roleSchema }),
  z.strictObject({ ...bulkBase, operation: z.literal("set_unit"), value: uuidSchema.nullable() }),
  z.strictObject({ ...bulkBase, operation: z.literal("set_status"), value: z.enum(BULK_STATUSES) }),
  z.strictObject({ ...bulkBase, operation: z.literal("grant_sim"), value: simIdSchema }),
  z.strictObject({ ...bulkBase, operation: z.literal("revoke_sim"), value: simIdSchema }),
]);

export type BulkRequest = z.infer<typeof bulkRequestSchema>;

export const bulkQuerySchema = z.object({ dryRun: queryBooleanSchema.optional() });

export type BulkQuery = z.infer<typeof bulkQuerySchema>;
