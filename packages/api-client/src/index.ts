import {
  ROLES,
  adminRewardListResponseSchema,
  attemptWriteRequestSchema,
  authMeResponseSchema,
  authMethodSchema,
  bulkRequestSchema,
  createUserRequestSchema,
  displayNameSchema,
  emailSchema,
  errorResponseSchema,
  gamiAllResponseSchema,
  gamiLeaderboardQuerySchema,
  gamiLeaderboardResponseSchema,
  gamiSimIdParamSchema,
  gamiSummaryResponseSchema,
  isoDateTimeSchema,
  meRewardResponseSchema,
  meRewardsOverviewResponseSchema,
  mePreferencesResponseSchema,
  mePreferencesSchema,
  pageMetaSchema,
  rewardMonthSchema,
  rewardSchema,
  rewardUpsertRequestSchema,
  rewardWinnerSchema,
  roleSchema,
  simIdSchema,
  updateUserRequestSchema,
  userListQuerySchema,
  userStatusSchema,
  usernameSchema,
  uuidSchema,
  type AttemptWriteRequest,
  type AuthMeResponse,
  type AuthMethod,
  type BulkRequest,
  type CreateUserRequest,
  type ErrorCode,
  type GamiAllResponse,
  type GamiLeaderboardQuery,
  type GamiLeaderboardResponse,
  type GamiSummaryResponse,
  type MePreferences,
  type RewardBody,
  type RewardUpsertRequest,
  type RewardWinnerBody,
  type Role,
  type SimId,
  type UpdateUserRequest,
  type UserListQuery,
  type UserStatus,
} from "@egemed/contracts";

export interface ApiResponseHeaders {
  get(name: string): string | null;
}

export interface ApiResponse {
  readonly status: number;
  readonly headers: ApiResponseHeaders;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface ApiFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly credentials?: "include";
}

export type ApiFetch = (input: string, init: ApiFetchInit) => Promise<ApiResponse>;

export interface CreateApiClientOptions {
  readonly baseUrl: string;
  readonly fetch: ApiFetch;
  readonly readCsrfToken?: (() => string | null | undefined) | undefined;
}

export class ApiError extends Error {
  readonly name = "ApiError";

  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    readonly details: unknown,
  ) {
    super(`API hatası: ${code}`);
  }
}

export class ApiNetworkError extends Error {
  readonly name = "ApiNetworkError";

  constructor(readonly reason: unknown) {
    super("Ağ isteği başarısız oldu.");
  }
}

export class ApiSchemaError extends Error {
  readonly name = "ApiSchemaError";

  constructor(
    message: string,
    readonly context: string,
    readonly payload: unknown,
    readonly issues: readonly unknown[],
  ) {
    super(message);
  }
}

const SESSION_MISSING_CODES: readonly ErrorCode[] = [
  "unauthorized",
  "session_expired",
  "auth_state_invalid",
  "auth_denied_unknown_user",
  "auth_denied_suspended",
  "auth_subject_mismatch",
];

export function isSessionMissingError(error: unknown): boolean {
  return error instanceof ApiError && SESSION_MISSING_CODES.includes(error.code);
}

interface SchemaLike<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
}

type QueryValue = string | number | boolean | null | undefined;
type QueryMap = Readonly<Record<string, QueryValue>>;

const CSRF_HEADER = "X-CSRF-Token";
const IMPORT_MODES = ["ekle", "guncelle"] as const;
const IMPORT_BATCH_STATUSES = ["uploaded", "validated", "applied", "failed"] as const;
const IMPORT_ROW_STATUSES = ["valid", "error"] as const;

export type ImportMode = (typeof IMPORT_MODES)[number];
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ApiAdminUserListItem {
  readonly id: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly email: string | null;
  readonly roles: readonly Role[];
  readonly unitId: string | null;
  readonly unitName: string | null;
  readonly status: UserStatus;
  readonly authMethod: AuthMethod;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

export interface ApiAdminUserDetail extends ApiAdminUserListItem {
  readonly simAccess: readonly SimId[];
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface ApiAdminUsersListResponse {
  readonly data: readonly ApiAdminUserListItem[];
  readonly meta: PageMeta;
}

export interface ApiBulkSkippedRow {
  readonly userId: string;
  readonly code: string;
}

export interface ApiBulkResponse {
  readonly data: {
    readonly dryRun: boolean;
    readonly updated: number;
    readonly skipped: readonly ApiBulkSkippedRow[];
  };
}

export interface ApiRoleSetResponse {
  readonly data: {
    readonly id: string;
    readonly displayName: string;
    readonly roles: readonly Role[];
    readonly status: UserStatus;
  };
}

export interface ApiImportBatch {
  readonly id: string;
  readonly fileName: string;
  readonly mode: ImportMode;
  readonly status: ImportBatchStatus;
  readonly templateVersion: string;
  readonly rowCount: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly appliedCount: number;
  readonly createdAt: string;
  readonly validatedAt: string | null;
  readonly appliedAt: string | null;
}

export interface ApiImportBatchResponse {
  readonly data: ApiImportBatch;
}

export interface ApiImportRowError {
  readonly column: string;
  readonly code: string;
  readonly message: string;
}

export interface ApiImportRow {
  readonly rowNo: number;
  readonly status: ImportRowStatus;
  readonly errors: readonly ApiImportRowError[];
  readonly matchedUserId: string | null;
}

export interface ApiImportRowsResponse {
  readonly data: readonly ApiImportRow[];
  readonly meta: PageMeta;
}

export interface ApiImportValidateResponse {
  readonly data: ApiImportBatch & {
    readonly preview: readonly ApiImportRow[];
  };
}

export interface ApiImportResultResponse {
  readonly data: ApiImportBatch & {
    readonly errorsCsv: string;
  };
}

export interface ApiImportApplyResponse {
  readonly data: {
    readonly alreadyApplied: boolean;
    readonly rowCount: number;
    readonly validCount: number;
    readonly errorCount: number;
    readonly applied: number;
    readonly appliedAt: string | null;
  };
}

export type ApiAuditEntry = Readonly<Record<string, unknown>>;

export interface ApiAuditListResponse {
  readonly data: readonly ApiAuditEntry[];
  readonly meta: PageMeta | null;
}

export type ApiAdminReward = RewardBody & { readonly winners: readonly RewardWinnerBody[] };

export interface ApiAdminRewardListResponse {
  readonly data: readonly ApiAdminReward[];
}

export interface ApiMeRewardResponse {
  readonly data: {
    readonly current: RewardBody | null;
    readonly winners: readonly RewardWinnerBody[];
  };
}

export interface ApiMeRewardsOverviewSim {
  readonly simId: SimId;
  readonly current: RewardBody | null;
  readonly lastMonthWinners: readonly RewardWinnerBody[];
}

export interface ApiMeRewardsOverviewResponse {
  readonly data: {
    readonly sims: readonly ApiMeRewardsOverviewSim[];
  };
}

export interface ApiClient {
  readonly auth: {
    me(): Promise<AuthMeResponse>;
    logout(): Promise<void>;
    devLogin(input: { readonly username: string }): Promise<AuthMeResponse>;
  };
  readonly admin: {
    listUsers(query?: UserListQuery): Promise<ApiAdminUsersListResponse>;
    createUser(input: CreateUserRequest): Promise<ApiAdminUserDetail>;
    getUser(id: string): Promise<ApiAdminUserDetail>;
    updateUser(id: string, patch: UpdateUserRequest): Promise<ApiAdminUserDetail>;
    suspendUser(id: string): Promise<ApiAdminUserDetail>;
    activateUser(id: string): Promise<ApiAdminUserDetail>;
    deleteUser(id: string): Promise<ApiAdminUserDetail>;
    bulkUsers(input: BulkRequest, options?: { readonly dryRun?: boolean | undefined }): Promise<ApiBulkResponse>;
    setUserRoles(id: string, input: { readonly roles: readonly Role[] }): Promise<ApiRoleSetResponse>;
    imports: {
      getTemplate(): Promise<string>;
      upload(content: string, query: { readonly fileName: string; readonly mode?: ImportMode | undefined }): Promise<ApiImportBatchResponse>;
      get(id: string): Promise<ApiImportBatchResponse>;
      listRows(
        id: string,
        query?: { readonly status?: ImportRowStatus | undefined; readonly page?: number | undefined; readonly pageSize?: number | undefined },
      ): Promise<ApiImportRowsResponse>;
      getResult(id: string): Promise<ApiImportResultResponse>;
      validate(id: string): Promise<ApiImportValidateResponse>;
      apply(id: string): Promise<ApiImportApplyResponse>;
    };
    listAudit(query?: QueryMap): Promise<ApiAuditListResponse>;
  };
  readonly rewards: {
    listAdminRewards(simId?: SimId): Promise<ApiAdminRewardListResponse>;
    upsertAdminReward(simId: SimId, month: string, body: RewardUpsertRequest): Promise<ApiAdminReward>;
    deleteAdminReward(simId: SimId, month: string): Promise<void>;
    finalizeAdminReward(simId: SimId, month: string): Promise<ApiAdminReward | null>;
    getMyRewards(): Promise<ApiMeRewardsOverviewResponse>;
    getMySimReward(simId: SimId): Promise<ApiMeRewardResponse>;
  };
  readonly gamification: {
    getAll(): Promise<GamiAllResponse>;
    getSummary(simId: SimId): Promise<GamiSummaryResponse>;
    getLeaderboard(simId: SimId, query?: GamiLeaderboardQuery): Promise<GamiLeaderboardResponse>;
    writeAttempt(simId: SimId, input: AttemptWriteRequest): Promise<void>;
  };
  readonly preferences: {
    getPreferences(): Promise<{ readonly data: MePreferences }>;
    setPreferences(input: MePreferences): Promise<{ readonly data: MePreferences }>;
  };
}

export function createApiClient(options: CreateApiClientOptions): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  async function performRequest(input: {
    readonly method: string;
    readonly path: string;
    readonly query?: QueryMap;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
    readonly contentType?: string;
    readonly acceptsJson?: boolean;
  }): Promise<ApiResponse> {
    const url = buildUrl(baseUrl, input.path, input.query);
    const headers: Record<string, string> = {};
    if (input.acceptsJson !== false) {
      headers.accept = "application/json";
    }
    if (input.contentType !== undefined) {
      headers["content-type"] = input.contentType;
    }
    if (input.headers !== undefined) {
      for (const [key, value] of Object.entries(input.headers)) {
        headers[key] = value;
      }
    }
    if (isMutatingMethod(input.method)) {
      const csrfToken = options.readCsrfToken?.();
      if (csrfToken !== undefined && csrfToken !== null && csrfToken.length > 0) {
        headers[CSRF_HEADER] = csrfToken;
      }
    }

    let response: ApiResponse;
    try {
      response = await options.fetch(url, {
        method: input.method,
        credentials: "include",
        headers,
        ...(input.body === undefined ? {} : { body: input.body }),
      });
    } catch (error) {
      throw new ApiNetworkError(error);
    }

    if (response.status < 200 || response.status >= 300) {
      throw await toApiError(response, `${input.method} ${input.path}`);
    }
    return response;
  }

  async function requestJson<T>(input: {
    readonly method: string;
    readonly path: string;
    readonly query?: QueryMap;
    readonly body?: string;
    readonly contentType?: string;
    readonly parse: (value: unknown, context: string) => T;
  }): Promise<T> {
    const response = await performRequest(input);
    const context = `${input.method} ${input.path}`;
    const payload = await readJson(response, context);
    return input.parse(payload, context);
  }

  async function requestText(input: {
    readonly method: string;
    readonly path: string;
    readonly query?: QueryMap;
  }): Promise<string> {
    const response = await performRequest({ ...input, acceptsJson: false });
    return response.text();
  }

  async function requestNoContent(input: {
    readonly method: string;
    readonly path: string;
  }): Promise<void> {
    await performRequest(input);
  }

  const adminImports = {
    async getTemplate(): Promise<string> {
      return requestText({ method: "GET", path: "/admin/imports/template" });
    },
    async upload(
      content: string,
      query: { readonly fileName: string; readonly mode?: ImportMode | undefined },
    ): Promise<ApiImportBatchResponse> {
      if (typeof content !== "string") {
        throw new ApiSchemaError("CSV içeriği metin olmalıdır.", "POST /admin/imports request", content, []);
      }
      if (query.fileName.trim().length === 0 || query.fileName.length > 200) {
        throw new ApiSchemaError(
          "fileName boş olamaz ve en çok 200 karakter olmalıdır.",
          "POST /admin/imports query",
          query,
          [],
        );
      }
      if (query.mode !== undefined && !IMPORT_MODES.includes(query.mode)) {
        throw new ApiSchemaError("mode değeri geçersiz.", "POST /admin/imports query", query, []);
      }
      return requestJson({
        method: "POST",
        path: "/admin/imports",
        contentType: "text/csv; charset=utf-8",
        body: content,
        query: { fileName: query.fileName, mode: query.mode },
        parse: parseImportBatchResponse,
      });
    },
    async get(id: string): Promise<ApiImportBatchResponse> {
      const parsedId = parseSchema(uuidSchema, id, "GET /admin/imports/:id path");
      return requestJson({
        method: "GET",
        path: `/admin/imports/${parsedId}`,
        parse: parseImportBatchResponse,
      });
    },
    async listRows(
      id: string,
      query: { readonly status?: ImportRowStatus | undefined; readonly page?: number | undefined; readonly pageSize?: number | undefined } = {},
    ): Promise<ApiImportRowsResponse> {
      const parsedId = parseSchema(uuidSchema, id, "GET /admin/imports/:id/rows path");
      if (query.status !== undefined && !IMPORT_ROW_STATUSES.includes(query.status)) {
        throw new ApiSchemaError("status değeri geçersiz.", "GET /admin/imports/:id/rows query", query, []);
      }
      return requestJson({
        method: "GET",
        path: `/admin/imports/${parsedId}/rows`,
        query: {
          status: query.status,
          page: query.page,
          pageSize: query.pageSize,
        },
        parse: parseImportRowsResponse,
      });
    },
    async getResult(id: string): Promise<ApiImportResultResponse> {
      const parsedId = parseSchema(uuidSchema, id, "GET /admin/imports/:id/result path");
      return requestJson({
        method: "GET",
        path: `/admin/imports/${parsedId}/result`,
        parse: parseImportResultResponse,
      });
    },
    async validate(id: string): Promise<ApiImportValidateResponse> {
      const parsedId = parseSchema(uuidSchema, id, "POST /admin/imports/:id/validate path");
      return requestJson({
        method: "POST",
        path: `/admin/imports/${parsedId}/validate`,
        parse: parseImportValidateResponse,
      });
    },
    async apply(id: string): Promise<ApiImportApplyResponse> {
      const parsedId = parseSchema(uuidSchema, id, "POST /admin/imports/:id/apply path");
      return requestJson({
        method: "POST",
        path: `/admin/imports/${parsedId}/apply`,
        parse: parseImportApplyResponse,
      });
    },
  };

  return {
    auth: {
      async me(): Promise<AuthMeResponse> {
        return requestJson({
          method: "GET",
          path: "/auth/me",
          parse: (value, context) => parseSchema(authMeResponseSchema, value, `${context} response`),
        });
      },
      async logout(): Promise<void> {
        await requestNoContent({ method: "POST", path: "/auth/logout" });
      },
      async devLogin(input): Promise<AuthMeResponse> {
        const username = parseSchema(usernameSchema, input.username, "POST /auth/dev/login request.username");
        return requestJson({
          method: "POST",
          path: "/auth/dev/login",
          contentType: "application/json",
          body: JSON.stringify({ username }),
          parse: (value, context) => parseSchema(authMeResponseSchema, value, `${context} response`),
        });
      },
    },
    admin: {
      async listUsers(query: UserListQuery = {}): Promise<ApiAdminUsersListResponse> {
        const parsed = parseSchema(userListQuerySchema, query, "GET /admin/users query");
        return requestJson({
          method: "GET",
          path: "/admin/users",
          query: {
            q: parsed.q,
            role: parsed.role,
            unitId: parsed.unitId,
            status: parsed.status,
            authMethod: parsed.authMethod,
            sort: parsed.sort,
            order: parsed.order,
            page: parsed.page,
            pageSize: parsed.pageSize,
          },
          parse: parseAdminUsersListResponse,
        });
      },
      async createUser(input: CreateUserRequest): Promise<ApiAdminUserDetail> {
        const parsed = parseSchema(createUserRequestSchema, input, "POST /admin/users request");
        return requestJson({
          method: "POST",
          path: "/admin/users",
          contentType: "application/json",
          body: JSON.stringify(parsed),
          parse: parseAdminUserDetailEnvelope,
        });
      },
      async getUser(id: string): Promise<ApiAdminUserDetail> {
        const parsedId = parseSchema(uuidSchema, id, "GET /admin/users/:id path");
        return requestJson({
          method: "GET",
          path: `/admin/users/${parsedId}`,
          parse: parseAdminUserDetailEnvelope,
        });
      },
      async updateUser(id: string, patch: UpdateUserRequest): Promise<ApiAdminUserDetail> {
        const parsedId = parseSchema(uuidSchema, id, "PATCH /admin/users/:id path");
        const parsedPatch = parseSchema(updateUserRequestSchema, patch, "PATCH /admin/users/:id request");
        return requestJson({
          method: "PATCH",
          path: `/admin/users/${parsedId}`,
          contentType: "application/json",
          body: JSON.stringify(parsedPatch),
          parse: parseAdminUserDetailEnvelope,
        });
      },
      async suspendUser(id: string): Promise<ApiAdminUserDetail> {
        const parsedId = parseSchema(uuidSchema, id, "POST /admin/users/:id/suspend path");
        return requestJson({
          method: "POST",
          path: `/admin/users/${parsedId}/suspend`,
          parse: parseAdminUserDetailEnvelope,
        });
      },
      async activateUser(id: string): Promise<ApiAdminUserDetail> {
        const parsedId = parseSchema(uuidSchema, id, "POST /admin/users/:id/activate path");
        return requestJson({
          method: "POST",
          path: `/admin/users/${parsedId}/activate`,
          parse: parseAdminUserDetailEnvelope,
        });
      },
      async deleteUser(id: string): Promise<ApiAdminUserDetail> {
        const parsedId = parseSchema(uuidSchema, id, "DELETE /admin/users/:id path");
        return requestJson({
          method: "DELETE",
          path: `/admin/users/${parsedId}`,
          parse: parseAdminUserDetailEnvelope,
        });
      },
      async bulkUsers(
        input: BulkRequest,
        options: { readonly dryRun?: boolean | undefined } = {},
      ): Promise<ApiBulkResponse> {
        const parsedBody = parseSchema(bulkRequestSchema, input, "POST /admin/users/bulk request");
        const query = options.dryRun === undefined ? undefined : { dryRun: options.dryRun };
        return requestJson({
          method: "POST",
          path: "/admin/users/bulk",
          ...(query === undefined ? {} : { query }),
          contentType: "application/json",
          body: JSON.stringify(parsedBody),
          parse: parseBulkResponse,
        });
      },
      async setUserRoles(
        id: string,
        input: { readonly roles: readonly Role[] },
      ): Promise<ApiRoleSetResponse> {
        const parsedId = parseSchema(uuidSchema, id, "PUT /admin/users/:id/roles path");
        if (input.roles.length === 0) {
          throw new ApiSchemaError(
            "roles alanı en az bir rol içermelidir.",
            "PUT /admin/users/:id/roles request",
            input,
            [],
          );
        }
        if (new Set(input.roles).size !== input.roles.length) {
          throw new ApiSchemaError(
            "roles alanı tekrarlı değer içeremez.",
            "PUT /admin/users/:id/roles request",
            input,
            [],
          );
        }
        for (const role of input.roles) {
          parseSchema(roleSchema, role, "PUT /admin/users/:id/roles request.roles[]");
        }
        return requestJson({
          method: "PUT",
          path: `/admin/users/${parsedId}/roles`,
          contentType: "application/json",
          body: JSON.stringify({ roles: input.roles }),
          parse: parseRoleSetResponse,
        });
      },
      imports: adminImports,
      async listAudit(query: QueryMap = {}): Promise<ApiAuditListResponse> {
        return requestJson({
          method: "GET",
          path: "/admin/audit",
          query,
          parse: parseAuditListResponse,
        });
      },
    },
    rewards: {
      async listAdminRewards(simId?: SimId): Promise<ApiAdminRewardListResponse> {
        const parsedSimId = simId === undefined ? undefined : parseSchema(simIdSchema, simId, "GET /admin/rewards query.simId");
        return requestJson({
          method: "GET",
          path: "/admin/rewards",
          query: { simId: parsedSimId },
          parse: (value, context) => parseSchema(adminRewardListResponseSchema, value, `${context} response`),
        });
      },
      async upsertAdminReward(simId: SimId, month: string, body: RewardUpsertRequest): Promise<ApiAdminReward> {
        const parsedSimId = parseSchema(simIdSchema, simId, "PUT /admin/rewards/:simId/:month path.simId");
        const parsedMonth = parseSchema(rewardMonthSchema, month, "PUT /admin/rewards/:simId/:month path.month");
        const parsedBody = parseSchema(rewardUpsertRequestSchema, body, "PUT /admin/rewards/:simId/:month request");
        return requestJson({
          method: "PUT",
          path: `/admin/rewards/${parsedSimId}/${parsedMonth}`,
          contentType: "application/json",
          body: JSON.stringify(parsedBody),
          parse: parseAdminRewardEnvelope,
        });
      },
      async deleteAdminReward(simId: SimId, month: string): Promise<void> {
        const parsedSimId = parseSchema(simIdSchema, simId, "DELETE /admin/rewards/:simId/:month path.simId");
        const parsedMonth = parseSchema(rewardMonthSchema, month, "DELETE /admin/rewards/:simId/:month path.month");
        await requestNoContent({
          method: "DELETE",
          path: `/admin/rewards/${parsedSimId}/${parsedMonth}`,
        });
      },
      async finalizeAdminReward(simId: SimId, month: string): Promise<ApiAdminReward | null> {
        const parsedSimId = parseSchema(simIdSchema, simId, "POST /admin/rewards/:simId/:month/finalize path.simId");
        const parsedMonth = parseSchema(rewardMonthSchema, month, "POST /admin/rewards/:simId/:month/finalize path.month");
        return requestJson({
          method: "POST",
          path: `/admin/rewards/${parsedSimId}/${parsedMonth}/finalize`,
          parse: parseAdminRewardEnvelopeNullable,
        });
      },
      async getMyRewards(): Promise<ApiMeRewardsOverviewResponse> {
        return requestJson({
          method: "GET",
          path: "/me/rewards",
          parse: (value, context) => parseSchema(meRewardsOverviewResponseSchema, value, `${context} response`),
        });
      },
      async getMySimReward(simId: SimId): Promise<ApiMeRewardResponse> {
        const parsedSimId = parseSchema(gamiSimIdParamSchema, simId, "GET /me/rewards/:simId path");
        return requestJson({
          method: "GET",
          path: `/me/rewards/${parsedSimId}`,
          parse: (value, context) => parseSchema(meRewardResponseSchema, value, `${context} response`),
        });
      },
    },
    gamification: {
      async getAll(): Promise<GamiAllResponse> {
        return requestJson({
          method: "GET",
          path: "/me/gamification",
          parse: (value, context) => parseSchema(gamiAllResponseSchema, value, `${context} response`),
        });
      },
      async getSummary(simId: SimId): Promise<GamiSummaryResponse> {
        const parsedSimId = parseSchema(gamiSimIdParamSchema, simId, "GET /me/gamification/:simId path");
        return requestJson({
          method: "GET",
          path: `/me/gamification/${parsedSimId}`,
          parse: (value, context) => parseSchema(gamiSummaryResponseSchema, value, `${context} response`),
        });
      },
      async getLeaderboard(
        simId: SimId,
        query: GamiLeaderboardQuery = { period: "month", cohort: "all", page: 1, pageSize: 50 },
      ): Promise<GamiLeaderboardResponse> {
        const parsedSimId = parseSchema(gamiSimIdParamSchema, simId, "GET /me/gamification/:simId/leaderboard path");
        const parsedQuery = parseSchema(
          gamiLeaderboardQuerySchema,
          query,
          "GET /me/gamification/:simId/leaderboard query",
        );
        return requestJson({
          method: "GET",
          path: `/me/gamification/${parsedSimId}/leaderboard`,
          query: {
            period: parsedQuery.period,
            cohort: parsedQuery.cohort,
            page: parsedQuery.page,
            pageSize: parsedQuery.pageSize,
          },
          parse: (value, context) => parseSchema(gamiLeaderboardResponseSchema, value, `${context} response`),
        });
      },
      async writeAttempt(simId: SimId, input: AttemptWriteRequest): Promise<void> {
        const parsedSimId = parseSchema(gamiSimIdParamSchema, simId, "POST /me/gamification/:simId/attempts path");
        const parsedBody = parseSchema(
          attemptWriteRequestSchema,
          input,
          "POST /me/gamification/:simId/attempts request",
        );
        const response = await performRequest({
          method: "POST",
          path: `/me/gamification/${parsedSimId}/attempts`,
          contentType: "application/json",
          body: JSON.stringify(parsedBody),
        });
        if (response.status === 204) return;
        const payload = await readJson(response, "POST /me/gamification/:simId/attempts");
        const object = asObject(payload, "POST /me/gamification/:simId/attempts response");
        if (!Object.hasOwn(object, "data")) {
          throw new ApiSchemaError(
            "Yanıtta data alanı bulunamadı.",
            "POST /me/gamification/:simId/attempts response",
            payload,
            [],
          );
        }
      },
    },
    preferences: {
      async getPreferences(): Promise<{ readonly data: MePreferences }> {
        return requestJson({
          method: "GET",
          path: "/me/preferences",
          parse: (value, context) => parseSchema(mePreferencesResponseSchema, value, `${context} response`),
        });
      },
      async setPreferences(input): Promise<{ readonly data: MePreferences }> {
        const parsed = parseSchema(mePreferencesSchema, input, "PATCH /me/preferences request");
        return requestJson({
          method: "PATCH",
          path: "/me/preferences",
          contentType: "application/json",
          body: JSON.stringify(parsed),
          parse: (value, context) => parseSchema(mePreferencesResponseSchema, value, `${context} response`),
        });
      },
    },
  };
}

function buildUrl(baseUrl: string, path: string, query: QueryMap | undefined): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const entries: string[] = [];
  if (query !== undefined) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return entries.length === 0
    ? `${baseUrl}${normalizedPath}`
    : `${baseUrl}${normalizedPath}?${entries.join("&")}`;
}

function isMutatingMethod(method: string): boolean {
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

async function toApiError(response: ApiResponse, context: string): Promise<ApiError | ApiSchemaError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    const text = await response.text().catch(() => "");
    return new ApiSchemaError(`${context} hata yanıtı JSON değil.`, context, text, []);
  }
  const parsed = errorResponseSchema.safeParse(payload);
  if (parsed.success) {
    return new ApiError(parsed.data.error.code, response.status, parsed.data.error.details);
  }
  return new ApiSchemaError(
    `${context} hata yanıtı sözleşmeye uymuyor.`,
    context,
    payload,
    issuesOf(parsed.error),
  );
}

async function readJson(response: ApiResponse, context: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    const text = await response.text().catch(() => "");
    throw new ApiSchemaError(`${context} JSON gövdesi okunamadı.`, context, text, []);
  }
}

function issuesOf(error: unknown): readonly unknown[] {
  if (typeof error !== "object" || error === null) return [];
  const issues = (error as { issues?: unknown }).issues;
  return Array.isArray(issues) ? issues : [];
}

function parseSchema<T>(schema: SchemaLike<T>, value: unknown, context: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ApiSchemaError(`${context} sözleşmeye uymuyor.`, context, value, issuesOf(parsed.error));
}

function asObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new ApiSchemaError(`${context} nesne olmalıdır.`, context, value, []);
}

function asArray(value: unknown, context: string): readonly unknown[] {
  if (Array.isArray(value)) return value;
  throw new ApiSchemaError(`${context} dizi olmalıdır.`, context, value, []);
}

function parseString(value: unknown, context: string): string {
  if (typeof value === "string") return value;
  throw new ApiSchemaError(`${context} metin olmalıdır.`, context, value, []);
}

function parseNullable<T>(
  value: unknown,
  context: string,
  parser: (input: unknown, nestedContext: string) => T,
): T | null {
  if (value === null) return null;
  return parser(value, context);
}

function parsePageMeta(value: unknown, context: string): PageMeta {
  return parseSchema(pageMetaSchema, value, context);
}

function parseRoles(value: unknown, context: string): readonly Role[] {
  return asArray(value, context).map((item, index) =>
    parseSchema(roleSchema, item, `${context}[${index}]`),
  );
}

function parseSimAccess(value: unknown, context: string): readonly SimId[] {
  return asArray(value, context).map((item, index) =>
    parseSchema(simIdSchema, item, `${context}[${index}]`),
  );
}

function parseAdminUserListItem(value: unknown, context: string): ApiAdminUserListItem {
  const object = asObject(value, context);
  return {
    id: parseSchema(uuidSchema, object.id, `${context}.id`),
    displayName: parseSchema(displayNameSchema, object.displayName, `${context}.displayName`),
    username: parseNullable(object.username, `${context}.username`, (input, nested) =>
      parseSchema(usernameSchema, input, nested),
    ),
    email: parseNullable(object.email, `${context}.email`, (input, nested) =>
      parseSchema(emailSchema, input, nested),
    ),
    roles: parseRoles(object.roles, `${context}.roles`),
    unitId: parseNullable(object.unitId, `${context}.unitId`, (input, nested) =>
      parseSchema(uuidSchema, input, nested),
    ),
    unitName: parseNullable(object.unitName, `${context}.unitName`, parseString),
    status: parseSchema(userStatusSchema, object.status, `${context}.status`),
    authMethod: parseSchema(authMethodSchema, object.authMethod, `${context}.authMethod`),
    createdAt: parseSchema(isoDateTimeSchema, object.createdAt, `${context}.createdAt`),
    lastLoginAt: parseNullable(object.lastLoginAt, `${context}.lastLoginAt`, (input, nested) =>
      parseSchema(isoDateTimeSchema, input, nested),
    ),
  };
}

function parseAdminUserDetail(value: unknown, context: string): ApiAdminUserDetail {
  const object = asObject(value, context);
  const base = parseAdminUserListItem(value, context);
  return {
    ...base,
    simAccess: parseSimAccess(object.simAccess, `${context}.simAccess`),
    updatedAt: parseSchema(isoDateTimeSchema, object.updatedAt, `${context}.updatedAt`),
    deletedAt: parseNullable(object.deletedAt, `${context}.deletedAt`, (input, nested) =>
      parseSchema(isoDateTimeSchema, input, nested),
    ),
  };
}

function parseAdminUsersListResponse(value: unknown, context: string): ApiAdminUsersListResponse {
  const object = asObject(value, context);
  return {
    data: asArray(object.data, `${context}.data`).map((item, index) =>
      parseAdminUserListItem(item, `${context}.data[${index}]`),
    ),
    meta: parsePageMeta(object.meta, `${context}.meta`),
  };
}

function parseAdminUserDetailEnvelope(value: unknown, context: string): ApiAdminUserDetail {
  const object = asObject(value, context);
  return parseAdminUserDetail(object.data, `${context}.data`);
}

function parseBulkResponse(value: unknown, context: string): ApiBulkResponse {
  const object = asObject(value, context);
  const data = asObject(object.data, `${context}.data`);
  return {
    data: {
      dryRun: parseBoolean(data.dryRun, `${context}.data.dryRun`),
      updated: parseNonNegativeInt(data.updated, `${context}.data.updated`),
      skipped: asArray(data.skipped, `${context}.data.skipped`).map((row, index) => {
        const rowObject = asObject(row, `${context}.data.skipped[${index}]`);
        return {
          userId: parseSchema(uuidSchema, rowObject.userId, `${context}.data.skipped[${index}].userId`),
          code: parseString(rowObject.code, `${context}.data.skipped[${index}].code`),
        };
      }),
    },
  };
}

function parseRoleSetResponse(value: unknown, context: string): ApiRoleSetResponse {
  const object = asObject(value, context);
  const data = asObject(object.data, `${context}.data`);
  return {
    data: {
      id: parseSchema(uuidSchema, data.id, `${context}.data.id`),
      displayName: parseSchema(displayNameSchema, data.displayName, `${context}.data.displayName`),
      roles: parseRoles(data.roles, `${context}.data.roles`),
      status: parseSchema(userStatusSchema, data.status, `${context}.data.status`),
    },
  };
}

function parseAdminReward(value: unknown, context: string): ApiAdminReward {
  const object = asObject(value, context);
  const { winners, ...rewardFields } = object;
  const reward = parseSchema(rewardSchema, rewardFields, context);
  const parsedWinners = asArray(winners, `${context}.winners`).map((winner, index) =>
    parseSchema(rewardWinnerSchema, winner, `${context}.winners[${index}]`),
  );
  return { ...reward, winners: parsedWinners };
}

function parseAdminRewardEnvelope(value: unknown, context: string): ApiAdminReward {
  const object = asObject(value, context);
  return parseAdminReward(object.data, `${context}.data`);
}

function parseAdminRewardEnvelopeNullable(value: unknown, context: string): ApiAdminReward | null {
  const object = asObject(value, context);
  return parseNullable(object.data, `${context}.data`, parseAdminReward);
}

function parseImportMode(value: unknown, context: string): ImportMode {
  if (typeof value === "string" && IMPORT_MODES.includes(value as ImportMode)) {
    return value as ImportMode;
  }
  throw new ApiSchemaError(`${context} geçersiz import mode.`, context, value, []);
}

function parseImportBatchStatus(value: unknown, context: string): ImportBatchStatus {
  if (typeof value === "string" && IMPORT_BATCH_STATUSES.includes(value as ImportBatchStatus)) {
    return value as ImportBatchStatus;
  }
  throw new ApiSchemaError(`${context} geçersiz import batch status.`, context, value, []);
}

function parseImportRowStatus(value: unknown, context: string): ImportRowStatus {
  if (typeof value === "string" && IMPORT_ROW_STATUSES.includes(value as ImportRowStatus)) {
    return value as ImportRowStatus;
  }
  throw new ApiSchemaError(`${context} geçersiz import row status.`, context, value, []);
}

function parseImportBatch(value: unknown, context: string): ApiImportBatch {
  const object = asObject(value, context);
  return {
    id: parseSchema(uuidSchema, object.id, `${context}.id`),
    fileName: parseString(object.fileName, `${context}.fileName`),
    mode: parseImportMode(object.mode, `${context}.mode`),
    status: parseImportBatchStatus(object.status, `${context}.status`),
    templateVersion: parseString(object.templateVersion, `${context}.templateVersion`),
    rowCount: parseNonNegativeInt(object.rowCount, `${context}.rowCount`),
    validCount: parseNonNegativeInt(object.validCount, `${context}.validCount`),
    errorCount: parseNonNegativeInt(object.errorCount, `${context}.errorCount`),
    appliedCount: parseNonNegativeInt(object.appliedCount, `${context}.appliedCount`),
    createdAt: parseSchema(isoDateTimeSchema, object.createdAt, `${context}.createdAt`),
    validatedAt: parseNullable(object.validatedAt, `${context}.validatedAt`, (input, nested) =>
      parseSchema(isoDateTimeSchema, input, nested),
    ),
    appliedAt: parseNullable(object.appliedAt, `${context}.appliedAt`, (input, nested) =>
      parseSchema(isoDateTimeSchema, input, nested),
    ),
  };
}

function parseImportBatchResponse(value: unknown, context: string): ApiImportBatchResponse {
  const object = asObject(value, context);
  return { data: parseImportBatch(object.data, `${context}.data`) };
}

function parseImportRowError(value: unknown, context: string): ApiImportRowError {
  const object = asObject(value, context);
  return {
    column: parseString(object.column, `${context}.column`),
    code: parseString(object.code, `${context}.code`),
    message: parseString(object.message, `${context}.message`),
  };
}

function parseImportRow(value: unknown, context: string): ApiImportRow {
  const object = asObject(value, context);
  return {
    rowNo: parsePositiveInt(object.rowNo, `${context}.rowNo`),
    status: parseImportRowStatus(object.status, `${context}.status`),
    errors: asArray(object.errors, `${context}.errors`).map((item, index) =>
      parseImportRowError(item, `${context}.errors[${index}]`),
    ),
    matchedUserId: parseNullable(object.matchedUserId, `${context}.matchedUserId`, (input, nested) =>
      parseSchema(uuidSchema, input, nested),
    ),
  };
}

function parseImportRowsResponse(value: unknown, context: string): ApiImportRowsResponse {
  const object = asObject(value, context);
  return {
    data: asArray(object.data, `${context}.data`).map((row, index) =>
      parseImportRow(row, `${context}.data[${index}]`),
    ),
    meta: parsePageMeta(object.meta, `${context}.meta`),
  };
}

function parseImportValidateResponse(value: unknown, context: string): ApiImportValidateResponse {
  const object = asObject(value, context);
  const data = asObject(object.data, `${context}.data`);
  const batch = parseImportBatch(data, `${context}.data`);
  return {
    data: {
      ...batch,
      preview: asArray(data.preview, `${context}.data.preview`).map((row, index) =>
        parseImportRow(row, `${context}.data.preview[${index}]`),
      ),
    },
  };
}

function parseImportResultResponse(value: unknown, context: string): ApiImportResultResponse {
  const object = asObject(value, context);
  const data = asObject(object.data, `${context}.data`);
  const batch = parseImportBatch(data, `${context}.data`);
  return {
    data: {
      ...batch,
      errorsCsv: parseString(data.errorsCsv, `${context}.data.errorsCsv`),
    },
  };
}

function parseImportApplyResponse(value: unknown, context: string): ApiImportApplyResponse {
  const object = asObject(value, context);
  const data = asObject(object.data, `${context}.data`);
  return {
    data: {
      alreadyApplied: parseBoolean(data.alreadyApplied, `${context}.data.alreadyApplied`),
      rowCount: parseNonNegativeInt(data.rowCount, `${context}.data.rowCount`),
      validCount: parseNonNegativeInt(data.validCount, `${context}.data.validCount`),
      errorCount: parseNonNegativeInt(data.errorCount, `${context}.data.errorCount`),
      applied: parseNonNegativeInt(data.applied, `${context}.data.applied`),
      appliedAt: parseNullable(data.appliedAt, `${context}.data.appliedAt`, (input, nested) =>
        parseSchema(isoDateTimeSchema, input, nested),
      ),
    },
  };
}

function parseAuditListResponse(value: unknown, context: string): ApiAuditListResponse {
  const object = asObject(value, context);
  const rows = asArray(object.data, `${context}.data`).map((entry, index) => {
    const row = asObject(entry, `${context}.data[${index}]`);
    if (Object.hasOwn(row, "id")) {
      parseSchema(uuidSchema, row.id, `${context}.data[${index}].id`);
    }
    if (Object.hasOwn(row, "occurredAt")) {
      parseSchema(isoDateTimeSchema, row.occurredAt, `${context}.data[${index}].occurredAt`);
    }
    return row;
  });
  const meta = Object.hasOwn(object, "meta")
    ? parsePageMeta(object.meta, `${context}.meta`)
    : null;
  return { data: rows, meta };
}

function parseBoolean(value: unknown, context: string): boolean {
  if (typeof value === "boolean") return value;
  throw new ApiSchemaError(`${context} boolean olmalıdır.`, context, value, []);
}

function parseNonNegativeInt(value: unknown, context: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  throw new ApiSchemaError(`${context} sıfır veya pozitif tam sayı olmalıdır.`, context, value, []);
}

function parsePositiveInt(value: unknown, context: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) return value;
  throw new ApiSchemaError(`${context} pozitif tam sayı olmalıdır.`, context, value, []);
}

// apps/shell UsersDataSource uyumlu adaptör (bağlama bir sonraki görevde).
export type UsersSourceRole = Role;
export type UsersSourceStatus = UserStatus;
export type UsersSourceAuthMethod = AuthMethod;
export type UsersSourceSort = "displayName" | "createdAt" | "lastLoginAt";
export type UsersSourceOrder = "asc" | "desc";
export type UsersSourceSimId = SimId;
export type UsersSourceMappingKeyType = "username" | "email";

export interface UsersSourceQuery {
  readonly q?: string | undefined;
  readonly role?: UsersSourceRole | undefined;
  readonly unitId?: string | undefined;
  readonly status?: UsersSourceStatus | undefined;
  readonly authMethod?: UsersSourceAuthMethod | undefined;
  readonly sort?: UsersSourceSort | undefined;
  readonly order?: UsersSourceOrder | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface UsersSourceMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface UsersSourceUser {
  readonly id: string;
  readonly displayName: string;
  readonly username: string;
  readonly role: UsersSourceRole;
  readonly unitId: string;
  readonly status: UsersSourceStatus;
  readonly authMethod: UsersSourceAuthMethod;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

export interface UsersSourceGamificationSummary {
  readonly simId: UsersSourceSimId;
  readonly xp: number;
  readonly level: number;
  readonly streakCurrent: number;
}

export type UsersSourceHistoryAction =
  | "user.create"
  | "user.suspend"
  | "user.activate"
  | "user.delete";

export interface UsersSourceHistoryEntry {
  readonly id: string;
  readonly occurredAt: string;
  readonly action: UsersSourceHistoryAction;
}

export interface UsersSourceUserDetail extends UsersSourceUser {
  readonly email: string | null;
  readonly roles: readonly UsersSourceRole[];
  readonly simAccess: readonly UsersSourceSimId[];
  readonly gamification: readonly UsersSourceGamificationSummary[];
  readonly history: readonly UsersSourceHistoryEntry[];
}

export interface UsersSourceListResult {
  readonly data: readonly UsersSourceUser[];
  readonly meta: UsersSourceMeta;
}

export interface UsersSourceCreateInput {
  readonly mappingKeyType: UsersSourceMappingKeyType;
  readonly mappingKeyValue: string;
  readonly displayName: string;
  readonly authMethod: UsersSourceAuthMethod;
  readonly unitId: string;
  readonly simAccess: readonly UsersSourceSimId[];
}

export interface UsersSourceUpdateInput {
  readonly displayName?: string | undefined;
  readonly unitId?: string | undefined;
  readonly status?: UsersSourceStatus | undefined;
}

export interface UsersDataSource {
  list(query: UsersSourceQuery): Promise<UsersSourceListResult>;
  get(id: string): Promise<UsersSourceUserDetail | null>;
  create(input: UsersSourceCreateInput): Promise<UsersSourceUserDetail>;
  update(id: string, patch: UsersSourceUpdateInput): Promise<UsersSourceUserDetail>;
}

export function createApiUsersSource(client: Pick<ApiClient, "admin">): UsersDataSource {
  async function list(query: UsersSourceQuery): Promise<UsersSourceListResult> {
    const response = await client.admin.listUsers({
      q: query.q,
      role: query.role,
      unitId: normalizeUnitId(query.unitId) ?? undefined,
      status: query.status,
      authMethod: query.authMethod,
      sort: query.sort,
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    });
    return {
      data: response.data.map(toUsersSourceUser),
      meta: response.meta,
    };
  }

  async function get(id: string): Promise<UsersSourceUserDetail | null> {
    try {
      const detail = await client.admin.getUser(id);
      return toUsersSourceDetail(detail);
    } catch (error) {
      if (error instanceof ApiError && error.code === "not_found") return null;
      throw error;
    }
  }

  async function create(input: UsersSourceCreateInput): Promise<UsersSourceUserDetail> {
    const mappingValue = input.mappingKeyValue.trim();
    const body: CreateUserRequest = {
      username: input.mappingKeyType === "username" ? mappingValue : undefined,
      email: input.mappingKeyType === "email" ? mappingValue : undefined,
      displayName: input.displayName,
      authMethod: input.authMethod,
      role: "kullanici",
      unitId: normalizeUnitId(input.unitId) ?? undefined,
      simAccess: [...input.simAccess],
    };
    const created = await client.admin.createUser(body);
    return toUsersSourceDetail(created);
  }

  async function update(id: string, patch: UsersSourceUpdateInput): Promise<UsersSourceUserDetail> {
    let latest: ApiAdminUserDetail | null = null;
    if (patch.displayName !== undefined || patch.unitId !== undefined) {
      const updateBody: UpdateUserRequest = {
        ...(patch.displayName === undefined ? {} : { displayName: patch.displayName }),
        ...(patch.unitId === undefined ? {} : { unitId: normalizeUnitId(patch.unitId) }),
      };
      latest = await client.admin.updateUser(id, updateBody);
    }
    if (patch.status !== undefined) {
      if (patch.status === "invited") {
        throw new ApiSchemaError(
          "invited durumu doğrudan atanamaz; yalnız sunucu akışıyla üretilir.",
          "UsersDataSource.update",
          patch,
          [],
        );
      }
      if (patch.status === "suspended") latest = await client.admin.suspendUser(id);
      if (patch.status === "active") latest = await client.admin.activateUser(id);
      if (patch.status === "deleted") latest = await client.admin.deleteUser(id);
    }
    if (latest === null) {
      latest = await client.admin.getUser(id);
    }
    return toUsersSourceDetail(latest);
  }

  return { list, get, create, update };
}

function normalizeUnitId(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function primaryRole(roles: readonly Role[]): UsersSourceRole {
  if (roles.includes("admin")) return "admin";
  return roles.includes("ogretim_uyesi") ? "ogretim_uyesi" : "kullanici";
}

function toUsersSourceUser(item: ApiAdminUserListItem): UsersSourceUser {
  return {
    id: item.id,
    displayName: item.displayName,
    username: item.username ?? item.email ?? item.id,
    role: primaryRole(item.roles),
    unitId: item.unitId ?? "",
    status: item.status,
    authMethod: item.authMethod,
    createdAt: item.createdAt,
    lastLoginAt: item.lastLoginAt,
  };
}

function toUsersSourceDetail(item: ApiAdminUserDetail): UsersSourceUserDetail {
  const base = toUsersSourceUser(item);
  return {
    ...base,
    email: item.email,
    roles: ROLES.filter((role) => item.roles.includes(role)),
    simAccess: [...item.simAccess],
    gamification: [],
    history: [],
  };
}

export {
  createApiGamiRepository,
  GamiRepositoryUnsupportedError,
  type CreateApiGamiRepositoryOptions,
  type EncodeAttemptInput,
} from "./gamification-repo";
