import type { AuthMethod, Role, SimId, UserStatus } from "@egemed/contracts";

/**
 * T63 — oturum çekirdeğinin depo arayüzleri (E3 §a, §c). Uçlar yalnız bu dar
 * arayüzlere bağlanır; PostgreSQL uygulaması parametreli sorgu kullanır,
 * bellek uygulaması testler içindir. Hiçbir kayıt ham belirteç taşımaz.
 */

/** Oturum satırı; `id` belirtecin SHA-256 özetinden türetilir (E3 §c). */
export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly authMethod: AuthMethod;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly expiresAt: number;
  readonly revokedAt: number | null;
}

export interface SessionRepo {
  insert(record: SessionRecord): Promise<void>;
  findById(id: string): Promise<SessionRecord | null>;
  touch(id: string, lastSeenAt: number): Promise<void>;
  revoke(id: string, revokedAt: number): Promise<void>;
  /** T65 — askıya alma ve silmede kullanıcının tüm açık oturumlarını iptal eder (E3 §a). */
  revokeForUser(userId: string, revokedAt: number): Promise<void>;
}

/** Giriş eşleme sorgusunun döndürdüğü dar kullanıcı yüzeyi. */
export interface AuthUser {
  readonly id: string;
  readonly status: UserStatus;
  readonly authMethod: AuthMethod;
  readonly institutionId: string;
}

/** `/auth/me` için kişisel alan içermeyen özet (E3 §d). */
export interface MeContext {
  readonly id: string;
  readonly displayName: string;
  readonly status: UserStatus;
  readonly institution: { readonly id: string; readonly name: string };
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
}

/** T64 — SSO eşleme anahtarı: kurum kullanıcı adı ve/veya e-posta (E3 §a). */
export interface SsoMappingKey {
  readonly username?: string | undefined;
  readonly email?: string | undefined;
}

export interface UserRepo {
  findByUsername(username: string): Promise<AuthUser | null>;
  /** T64 — eşleme anahtarıyla SSO kullanıcısı arar; büyük/küçük harf duyarsız. */
  findByMappingKey(key: SsoMappingKey): Promise<AuthUser | null>;
  /**
   * T64 — ilk girişte `sso_subject`i bağlar; bağlıysa mevcut değeri döndürür
   * (yarış güvenli). Kullanıcı yok/silinmişse `null`.
   */
  bindSsoSubject(userId: string, subject: string, at: number): Promise<string | null>;
  getMeContext(userId: string): Promise<MeContext | null>;
  markLogin(userId: string, at: number): Promise<void>;
}

/** Denetim kaydı: yalnız kodlu özet taşır; sır, belirteç ve ham veri yasak. */
export interface AuditEntry {
  readonly occurredAt: number;
  readonly actorUserId: string | null;
  /** T65 — eylem anındaki rol (E3 §c `actor_role`). */
  readonly actorRole?: string | null;
  readonly institutionId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  /** T65 — değişiklik öncesi özet (E3 §c `summary_before`); eski kayıtlarda yoktur. */
  readonly summaryBefore?: Readonly<Record<string, string>> | null;
  readonly summaryAfter: Readonly<Record<string, string>>;
  readonly requestId: string | null;
}

/** T67 — `/admin/audit` liste sorgusu (E3 §d): kurum kapsamlı, salt okunur. */
export interface AuditListQuery {
  readonly institutionId: string;
  readonly actorId?: string | undefined;
  readonly action?: string | undefined;
  readonly targetType?: string | undefined;
  readonly targetId?: string | undefined;
  /** Kapsayıcı alt/üst sınır (epoch ms). */
  readonly from?: number | undefined;
  readonly to?: number | undefined;
  readonly page: number;
  readonly pageSize: number;
}

/** Liste satırı: `id` bigint kolonunun ondalık dizgesi; yalnız kodlu özet taşır. */
export interface AuditListRow {
  readonly id: string;
  readonly occurredAt: number;
  readonly actorUserId: string | null;
  readonly actorRole: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly summaryBefore: Readonly<Record<string, string>> | null;
  readonly summaryAfter: Readonly<Record<string, string>> | null;
  readonly requestId: string | null;
  readonly actorName?: string | null;
  readonly targetName?: string | null;
}

export interface AuditRepo {
  insert(entry: AuditEntry): Promise<void>;
  /** T67 — kurum kapsamlı liste; filtreler ve sayfalama sunucuda uygulanır. */
  list(
    query: AuditListQuery,
  ): Promise<{ readonly rows: readonly AuditListRow[]; readonly total: number }>;
}

/** Havuzun depo katmanına görünen dar yüzeyi; `db.ts` çıktısı bunu karşılar. */
export interface AuthDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

interface PgAuthRepos {
  readonly sessions: SessionRepo;
  readonly users: UserRepo;
  readonly audit: AuditRepo;
}

/**
 * Satır değerleri migration CHECK kısıtlarıyla korunur; okuma tarafında dar
 * tiplere indirgenir. Zamanlar `timestamptz`ten enjekte saatle uyumlu epoch
 * milisaniyeye çevrilir.
 */
interface SessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly auth_method: string;
  readonly created_at: Date;
  readonly last_seen_at: Date;
  readonly expires_at: Date;
  readonly revoked_at: Date | null;
}

interface UserRow {
  readonly id: string;
  readonly status: string;
  readonly auth_method: string;
  readonly institution_id: string;
}

interface AuditRow {
  readonly id: string;
  readonly occurred_at: Date;
  readonly actor_user_id: string | null;
  readonly actor_role: string | null;
  readonly action: string;
  readonly target_type: string | null;
  readonly target_id: string | null;
  readonly summary_before: unknown;
  readonly summary_after: unknown;
  readonly request_id: string | null;
  readonly actor_name?: string | null;
  readonly target_name?: string | null;
}

/** jsonb özetleri yalnız nesne olarak kabul edilir; diğer değerler null'a indirgenir. */
function toSummary(value: unknown): Readonly<Record<string, string>> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Readonly<Record<string, string>>;
}

function toAuditListRow(row: AuditRow): AuditListRow {
  return {
    id: row.id,
    occurredAt: row.occurred_at.getTime(),
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summaryBefore: toSummary(row.summary_before),
    summaryAfter: toSummary(row.summary_after),
    requestId: row.request_id,
    actorName: row.actor_name ?? null,
    targetName: row.target_name ?? null,
  };
}

/** Filtreler koşul + parametre üretir; kullanıcı girdisi SQL metnine girmez. */
function buildAuditFilter(query: AuditListQuery): { readonly where: string; readonly params: unknown[] } {
  const params: unknown[] = [query.institutionId];
  const conditions = ["institution_id = $1"];
  if (query.actorId !== undefined) {
    params.push(query.actorId);
    conditions.push(`actor_user_id = $${params.length}`);
  }
  if (query.action !== undefined) {
    params.push(query.action);
    conditions.push(`action = $${params.length}`);
  }
  if (query.targetType !== undefined) {
    params.push(query.targetType);
    conditions.push(`target_type = $${params.length}`);
  }
  if (query.targetId !== undefined) {
    params.push(query.targetId);
    conditions.push(`target_id = $${params.length}`);
  }
  if (query.from !== undefined) {
    params.push(new Date(query.from));
    conditions.push(`occurred_at >= $${params.length}`);
  }
  if (query.to !== undefined) {
    params.push(new Date(query.to));
    conditions.push(`occurred_at <= $${params.length}`);
  }
  return { where: conditions.join(" and "), params };
}

function toSessionRecord(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    authMethod: row.auth_method as AuthMethod,
    createdAt: row.created_at.getTime(),
    lastSeenAt: row.last_seen_at.getTime(),
    expiresAt: row.expires_at.getTime(),
    revokedAt: row.revoked_at === null ? null : row.revoked_at.getTime(),
  };
}

/** Bellek deposunda kullanıcı satırının giriş eşlemesine görünen dar yüzeyi. */
function toAuthUser(user: MemoryUserState): AuthUser {
  return {
    id: user.id,
    status: user.status,
    authMethod: user.authMethod,
    institutionId: user.institutionId,
  };
}

export function createPgAuthRepos(db: AuthDb): PgAuthRepos {
  const sessions: SessionRepo = {
    async insert(record) {
      await db.query(
        "insert into sessions (id, user_id, auth_method, created_at, last_seen_at, expires_at, revoked_at) values ($1, $2, $3, $4, $5, $6, $7)",
        [
          record.id,
          record.userId,
          record.authMethod,
          new Date(record.createdAt),
          new Date(record.lastSeenAt),
          new Date(record.expiresAt),
          record.revokedAt === null ? null : new Date(record.revokedAt),
        ],
      );
    },
    async findById(id) {
      const result = await db.query(
        "select id, user_id, auth_method, created_at, last_seen_at, expires_at, revoked_at from sessions where id = $1",
        [id],
      );
      const row = result.rows[0] as SessionRow | undefined;
      return row === undefined ? null : toSessionRecord(row);
    },
    async touch(id, lastSeenAt) {
      await db.query("update sessions set last_seen_at = $2 where id = $1 and revoked_at is null", [
        id,
        new Date(lastSeenAt),
      ]);
    },
    async revoke(id, revokedAt) {
      await db.query("update sessions set revoked_at = coalesce(revoked_at, $2) where id = $1", [
        id,
        new Date(revokedAt),
      ]);
    },
    async revokeForUser(userId, revokedAt) {
      await db.query(
        "update sessions set revoked_at = coalesce(revoked_at, $2) where user_id = $1 and revoked_at is null",
        [userId, new Date(revokedAt)],
      );
    },
  };

  const users: UserRepo = {
    async findByUsername(username) {
      const result = await db.query(
        "select id, status, auth_method, institution_id from users where deleted_at is null and lower(username) = lower($1) limit 1",
        [username],
      );
      const row = result.rows[0] as UserRow | undefined;
      if (row === undefined) return null;
      return {
        id: row.id,
        status: row.status as UserStatus,
        authMethod: row.auth_method as AuthMethod,
        institutionId: row.institution_id,
      };
    },
    async findByMappingKey(key) {
      const username = key.username ?? "";
      const email = key.email ?? "";
      if (username === "" && email === "") return null;
      // Eksik anahtar boş dizgeyle sorulur; `lower(null)` karşılaştırması
      // eşleşmez, böylece koşul her zaman parametreli kalır. Kullanıcı adı
      // eşleşmesi e-posta eşleşmesine yeğlenir (belirlenimci sonuç).
      const result = await db.query(
        "select id, status, auth_method, institution_id from users where deleted_at is null and (lower(username) = lower($1) or lower(email) = lower($2)) order by case when lower(username) = lower($1) then 0 else 1 end limit 1",
        [username, email],
      );
      const row = result.rows[0] as UserRow | undefined;
      if (row === undefined) return null;
      return {
        id: row.id,
        status: row.status as UserStatus,
        authMethod: row.auth_method as AuthMethod,
        institutionId: row.institution_id,
      };
    },
    async bindSsoSubject(userId, subject, at) {
      // İlk bağlama kazanır: eşzamanlı iki girişten biri subject'i yazar,
      // diğeri mevcut değeri okur ve uyuşmazlıkta reddedilir.
      const result = await db.query(
        "update users set sso_subject = coalesce(sso_subject, $2), updated_at = $3 where id = $1 and deleted_at is null returning sso_subject",
        [userId, subject, new Date(at)],
      );
      const row = result.rows[0] as { readonly sso_subject: string } | undefined;
      return row === undefined ? null : row.sso_subject;
    },
    async getMeContext(userId) {
      const base = await db.query(
        "select u.id, u.display_name, u.status, u.institution_id, i.name as institution_name from users u join institutions i on i.id = u.institution_id where u.id = $1 and u.deleted_at is null",
        [userId],
      );
      const row = base.rows[0] as
        | {
            readonly id: string;
            readonly display_name: string;
            readonly status: string;
            readonly institution_id: string;
            readonly institution_name: string;
          }
        | undefined;
      if (row === undefined) return null;
      const roleRows = await db.query("select role from user_roles where user_id = $1 order by role", [userId]);
      const simRows = await db.query("select sim_id from sim_access where user_id = $1 order by sim_id", [userId]);
      return {
        id: row.id,
        displayName: row.display_name,
        status: row.status as UserStatus,
        institution: { id: row.institution_id, name: row.institution_name },
        roles: roleRows.rows.map((value) => (value as { readonly role: Role }).role),
        simAccess: simRows.rows.map((value) => (value as { readonly sim_id: SimId }).sim_id),
      };
    },
    async markLogin(userId, at) {
      await db.query(
        "update users set status = case when status = 'invited' then 'active' else status end, last_login_at = $2, updated_at = $2 where id = $1 and deleted_at is null",
        [userId, new Date(at)],
      );
    },
  };

  const audit: AuditRepo = {
    async insert(entry) {
      await db.query(
        "insert into audit_log (occurred_at, actor_user_id, actor_role, institution_id, action, target_type, target_id, summary_before, summary_after, request_id) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)",
        [
          new Date(entry.occurredAt),
          entry.actorUserId,
          entry.actorRole ?? null,
          entry.institutionId,
          entry.action,
          entry.targetType,
          entry.targetId,
          entry.summaryBefore == null ? null : JSON.stringify(entry.summaryBefore),
          JSON.stringify(entry.summaryAfter),
          entry.requestId,
        ],
      );
    },
    async list(query) {
      const filter = buildAuditFilter(query);
      const totalResult = await db.query(
        `select count(*)::int as total from audit_log where ${filter.where}`,
        filter.params,
      );
      const totalRow = totalResult.rows[0] as { readonly total?: unknown } | undefined;
      const rowsResult = await db.query(
        `select a.id::text as id, a.occurred_at, a.actor_user_id, a.actor_role, a.action, a.target_type, a.target_id, a.summary_before, a.summary_after, a.request_id, actor.display_name as actor_name,
          case
            when a.target_type = 'user' then target_user.display_name
            when a.target_type = 'import_batch' then batch.file_name
            when a.target_type = 'monthly_reward' then case reward.sim_id when 'pulse' then 'Pulse' when 'ausculta' then 'Ausculta' when 'opaca' then 'Opaca' end || ' · ' || reward.month
            else null
          end as target_name
        from audit_log a
        left join users actor on actor.id = a.actor_user_id and actor.institution_id = a.institution_id
        left join users target_user on a.target_type = 'user' and target_user.id::text = a.target_id and target_user.institution_id = a.institution_id
        left join import_batches batch on a.target_type = 'import_batch' and batch.id::text = a.target_id
        left join monthly_rewards reward on a.target_type = 'monthly_reward' and (reward.sim_id || ':' || reward.month) = a.target_id and reward.institution_id = a.institution_id
        where ${filter.where.replace(/\binstitution_id\b/g, 'a.institution_id').replace(/\bactor_user_id\b/g, 'a.actor_user_id').replace(/\baction\b/g, 'a.action').replace(/\btarget_type\b/g, 'a.target_type').replace(/\btarget_id\b/g, 'a.target_id').replace(/\boccurred_at\b/g, 'a.occurred_at')}
        order by a.occurred_at desc, a.id desc limit $${filter.params.length + 1} offset $${filter.params.length + 2}`,
        [...filter.params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        rows: rowsResult.rows.map((row) => toAuditListRow(row as AuditRow)),
        total: typeof totalRow?.total === "number" ? totalRow.total : 0,
      };
    },
  };

  return { sessions, users, audit };
}

/** Bellek deposu tohumu; testler sentetik kullanıcı kaydeder. */
export interface MemoryUserSeed {
  readonly id: string;
  readonly username?: string | null;
  /** T64 — SSO eşleme anahtarı; kurum içinde büyük/küçük harf duyarsız eşlenir. */
  readonly email?: string | null;
  /** T64 — bağlı IdP subject'i; farklı subject gelirse giriş reddedilir. */
  readonly ssoSubject?: string | null;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly status?: UserStatus;
  readonly institutionId: string;
  readonly institutionName: string;
  readonly roles?: readonly Role[];
  readonly simAccess?: readonly SimId[];
}

interface MemoryUserState {
  readonly id: string;
  readonly username: string | null;
  readonly email: string | null;
  ssoSubject: string | null;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  status: UserStatus;
  readonly institutionId: string;
  readonly institutionName: string;
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
  lastLoginAt: number | null;
}

/** Testlerin durum okuduğu/ayarladığı bellek deposu (DB gerekmez). */
interface MemoryAuthStore {
  readonly repos: PgAuthRepos;
  readonly sessionRecords: Map<string, SessionRecord>;
  readonly auditEntries: AuditEntry[];
  readonly userRecords: Map<string, MemoryUserState>;
  setStatus(userId: string, status: UserStatus): void;
}

export function createMemoryAuthStore(
  seed: { readonly users?: readonly MemoryUserSeed[] } = {},
): MemoryAuthStore {
  const sessionRecords = new Map<string, SessionRecord>();
  const auditEntries: AuditEntry[] = [];
  const userRecords = new Map<string, MemoryUserState>();

  for (const user of seed.users ?? []) {
    userRecords.set(user.id, {
      id: user.id,
      username: user.username ?? null,
      email: user.email ?? null,
      ssoSubject: user.ssoSubject ?? null,
      displayName: user.displayName,
      authMethod: user.authMethod,
      status: user.status ?? "active",
      institutionId: user.institutionId,
      institutionName: user.institutionName,
      roles: [...(user.roles ?? [])],
      simAccess: [...(user.simAccess ?? [])],
      lastLoginAt: null,
    });
  }

  const sessions: SessionRepo = {
    async insert(record) {
      sessionRecords.set(record.id, { ...record });
    },
    async findById(id) {
      const record = sessionRecords.get(id);
      return record === undefined ? null : { ...record };
    },
    async touch(id, lastSeenAt) {
      const record = sessionRecords.get(id);
      if (record !== undefined && record.revokedAt === null) {
        sessionRecords.set(id, { ...record, lastSeenAt });
      }
    },
    async revoke(id, revokedAt) {
      const record = sessionRecords.get(id);
      if (record !== undefined && record.revokedAt === null) {
        sessionRecords.set(id, { ...record, revokedAt });
      }
    },
    async revokeForUser(userId, revokedAt) {
      for (const [id, record] of sessionRecords) {
        if (record.userId === userId && record.revokedAt === null) {
          sessionRecords.set(id, { ...record, revokedAt });
        }
      }
    },
  };

  const users: UserRepo = {
    async findByUsername(username) {
      const needle = username.toLowerCase();
      for (const user of userRecords.values()) {
        if (user.status === "deleted") continue;
        if (user.username !== null && user.username.toLowerCase() === needle) {
          return {
            id: user.id,
            status: user.status,
            authMethod: user.authMethod,
            institutionId: user.institutionId,
          };
        }
      }
      return null;
    },
    async findByMappingKey(key) {
      const username = key.username?.toLowerCase();
      const email = key.email?.toLowerCase();
      if (username === undefined && email === undefined) return null;
      let emailMatch: MemoryUserState | null = null;
      for (const user of userRecords.values()) {
        if (user.status === "deleted") continue;
        if (username !== undefined && user.username?.toLowerCase() === username) {
          return toAuthUser(user);
        }
        if (emailMatch === null && email !== undefined && user.email?.toLowerCase() === email) {
          emailMatch = user;
        }
      }
      return emailMatch === null ? null : toAuthUser(emailMatch);
    },
    async bindSsoSubject(userId, subject) {
      const user = userRecords.get(userId);
      if (user === undefined || user.status === "deleted") return null;
      if (user.ssoSubject === null) user.ssoSubject = subject;
      return user.ssoSubject;
    },
    async getMeContext(userId) {
      const user = userRecords.get(userId);
      if (user === undefined || user.status === "deleted") return null;
      return {
        id: user.id,
        displayName: user.displayName,
        status: user.status,
        institution: { id: user.institutionId, name: user.institutionName },
        roles: [...user.roles],
        simAccess: [...user.simAccess],
      };
    },
    async markLogin(userId, at) {
      const user = userRecords.get(userId);
      if (user !== undefined) {
        if (user.status === "invited") user.status = "active";
        user.lastLoginAt = at;
      }
    },
  };

  const audit: AuditRepo = {
    async insert(entry) {
      auditEntries.push({ ...entry });
    },
    async list(query) {
      const matches = auditEntries
        .map((entry, index) => ({ id: String(index + 1), entry }))
        .filter(({ entry }) => {
          if (entry.institutionId !== query.institutionId) return false;
          if (query.actorId !== undefined && entry.actorUserId !== query.actorId) return false;
          if (query.action !== undefined && entry.action !== query.action) return false;
          if (query.targetType !== undefined && entry.targetType !== query.targetType) return false;
          if (query.targetId !== undefined && entry.targetId !== query.targetId) return false;
          if (query.from !== undefined && entry.occurredAt < query.from) return false;
          if (query.to !== undefined && entry.occurredAt > query.to) return false;
          return true;
        })
        .sort((a, b) => b.entry.occurredAt - a.entry.occurredAt || Number(b.id) - Number(a.id))
        .map(({ id, entry }) => ({
          id,
          occurredAt: entry.occurredAt,
          actorUserId: entry.actorUserId,
          actorRole: entry.actorRole ?? null,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          summaryBefore: entry.summaryBefore ?? null,
          summaryAfter: entry.summaryAfter,
          requestId: entry.requestId,
          actorName: entry.actorUserId === null ? null : userRecords.get(entry.actorUserId)?.displayName ?? null,
          targetName: entry.targetType === "user" && entry.targetId !== null ? userRecords.get(entry.targetId)?.displayName ?? null : null,
        }));
      const start = (query.page - 1) * query.pageSize;
      return { rows: matches.slice(start, start + query.pageSize), total: matches.length };
    },
  };

  return {
    repos: { sessions, users, audit },
    sessionRecords,
    auditEntries,
    userRecords,
    setStatus(userId, status) {
      const user = userRecords.get(userId);
      if (user !== undefined) user.status = status;
    },
  };
}
