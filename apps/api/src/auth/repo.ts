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

export interface UserRepo {
  findByUsername(username: string): Promise<AuthUser | null>;
  getMeContext(userId: string): Promise<MeContext | null>;
  markLogin(userId: string, at: number): Promise<void>;
}

/** Denetim kaydı: yalnız kodlu özet taşır; sır, belirteç ve ham veri yasak. */
export interface AuditEntry {
  readonly occurredAt: number;
  readonly actorUserId: string | null;
  readonly institutionId: string | null;
  readonly action: string;
  readonly targetType: string | null;
  readonly targetId: string | null;
  readonly summaryAfter: Readonly<Record<string, string>>;
  readonly requestId: string | null;
}

export interface AuditRepo {
  insert(entry: AuditEntry): Promise<void>;
}

/** Havuzun depo katmanına görünen dar yüzeyi; `db.ts` çıktısı bunu karşılar. */
export interface AuthDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

export interface PgAuthRepos {
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
        "insert into audit_log (occurred_at, actor_user_id, institution_id, action, target_type, target_id, summary_after, request_id) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)",
        [
          new Date(entry.occurredAt),
          entry.actorUserId,
          entry.institutionId,
          entry.action,
          entry.targetType,
          entry.targetId,
          JSON.stringify(entry.summaryAfter),
          entry.requestId,
        ],
      );
    },
  };

  return { sessions, users, audit };
}

/** Bellek deposu tohumu; testler sentetik kullanıcı kaydeder. */
export interface MemoryUserSeed {
  readonly id: string;
  readonly username?: string | null;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly status?: UserStatus;
  readonly institutionId: string;
  readonly institutionName: string;
  readonly roles?: readonly Role[];
  readonly simAccess?: readonly SimId[];
}

export interface MemoryUserState {
  readonly id: string;
  readonly username: string | null;
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
export interface MemoryAuthStore {
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
