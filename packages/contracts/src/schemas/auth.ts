import { z } from "zod";
import { displayNameSchema, roleSchema, simIdListSchema, uuidSchema } from "./common";

/** GET /auth/me (E3 §d): yalnız sunum alanları; eşleme anahtarı, oturum
 *  belirteci ve `sso_subject` yanıtta dönmez. */
export const authMeResponseSchema = z.strictObject({
  data: z.strictObject({
    id: uuidSchema,
    displayName: displayNameSchema,
    roles: z.array(z.strictObject({ role: roleSchema })).min(1),
    institution: z.strictObject({
      id: uuidSchema,
      name: z.string().trim().min(2).max(200),
    }),
    simAccess: simIdListSchema,
  }),
});

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
