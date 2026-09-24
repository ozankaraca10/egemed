import { ROLES, SIM_IDS, type AuthMethod, type Role, type SimId, type UserStatus } from "@egemed/contracts";

/**
 * T68 — kurulum tohumlarının (E3 §i/5 ilk admin, §a geliştirme sağlayıcısı) dar
 * depo yüzeyi: yalnız kurum ve kullanıcı yazımı gerekir. PostgreSQL uygulaması
 * parametreli sorgu kullanır; bellek uygulaması testler içindir. Denetim yazımı
 * ayrı bir yüzey değildir: tohumlar mevcut `AuditRepo` üzerinden yazar.
 */

export interface SeedInstitution {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface NewSeedInstitution {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly createdAt: number;
}

/** Var olan kullanıcı yalnız idempotentlik kontrolü için okunur. */
export interface SeedUserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly status: UserStatus;
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
}

export interface NewSeedUser {
  readonly id: string;
  readonly institutionId: string;
  readonly username: string;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly status: UserStatus;
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
  readonly xapiActorId: string;
  readonly createdAt: number;
}

export interface SeedRepo {
  findInstitutionByCode(code: string): Promise<SeedInstitution | null>;
  createInstitution(input: NewSeedInstitution): Promise<void>;
  /** Eşleme anahtarı büyük/küçük harf duyarsızdır; silinmiş kullanıcı dönmez. */
  findUserByUsername(institutionId: string, username: string): Promise<SeedUserRecord | null>;
  /** Kullanıcı, rolü ve sim erişimi tek ifadede yazılır (ya tümü ya hiçbiri). */
  createUser(input: NewSeedUser): Promise<void>;
}

/** Havuzun depo katmanına görünen dar yüzeyi; `db.ts` çıktısı bunu karşılar. */
export interface SeedDb {
  query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
}

interface InstitutionRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

interface SeedUserRow {
  readonly id: string;
  readonly username: string;
  readonly display_name: string;
  readonly auth_method: string;
  readonly status: string;
  readonly roles: readonly string[] | null;
  readonly sim_access: readonly string[] | null;
}

/** Satır değerleri migration CHECK kısıtlarıyla korunur; okuma dar tipe indirgenir. */
function normalizeRoles(values: readonly string[] | null): Role[] {
  return ROLES.filter((role) => values?.includes(role) === true);
}

function normalizeSimAccess(values: readonly string[] | null): SimId[] {
  return SIM_IDS.filter((simId) => values?.includes(simId) === true);
}

export function createPgSeedRepo(db: SeedDb): SeedRepo {
  return {
    async findInstitutionByCode(code) {
      const result = await db.query(
        "select id, code, name from institutions where code = $1 and deleted_at is null limit 1",
        [code],
      );
      const row = result.rows[0] as InstitutionRow | undefined;
      return row === undefined ? null : { id: row.id, code: row.code, name: row.name };
    },

    async createInstitution(input) {
      await db.query(
        "insert into institutions (id, code, name, created_at, updated_at) values ($1, $2, $3, $4, $4)",
        [input.id, input.code, input.name, new Date(input.createdAt)],
      );
    },

    async findUserByUsername(institutionId, username) {
      const result = await db.query(
        "select u.id, u.username, u.display_name, u.auth_method, u.status, (select coalesce(array_agg(r.role), '{}') from user_roles r where r.user_id = u.id) as roles, (select coalesce(array_agg(s.sim_id), '{}') from sim_access s where s.user_id = u.id) as sim_access from users u where u.institution_id = $1 and lower(u.username) = lower($2) and u.deleted_at is null limit 1",
        [institutionId, username],
      );
      const row = result.rows[0] as SeedUserRow | undefined;
      if (row === undefined) return null;
      return {
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        authMethod: row.auth_method as AuthMethod,
        status: row.status as UserStatus,
        roles: normalizeRoles(row.roles),
        simAccess: normalizeSimAccess(row.sim_access),
      };
    },

    async createUser(input) {
      // Tek ifade: kullanıcı, rol ve sim erişimi ya tümüyle yazılır ya hiçbiri.
      await db.query(
        "with created as (insert into users (id, institution_id, unit_id, username, email, display_name, auth_method, status, xapi_actor_id, created_at, updated_at) values ($1, $2, null, $3, null, $4, $5, $6, $7, $8, $8) returning id), granted as (insert into user_roles (user_id, role, granted_by, granted_at) select created.id, granted_role.value, null, $8 from created cross join unnest($9::text[]) as granted_role(value)) insert into sim_access (user_id, sim_id, granted_by, granted_at) select created.id, granted_sim.value, null, $8 from created cross join unnest($10::text[]) as granted_sim(value)",
        [
          input.id,
          input.institutionId,
          input.username,
          input.displayName,
          input.authMethod,
          input.status,
          input.xapiActorId,
          new Date(input.createdAt),
          [...input.roles],
          [...input.simAccess],
        ],
      );
    },
  };
}

export interface MemorySeedUser extends SeedUserRecord {
  readonly institutionId: string;
  readonly xapiActorId: string;
  readonly createdAt: number;
}

/** Testlerin durum okuduğu bellek deposu (DB gerekmez). */
export interface MemorySeedStore {
  readonly repo: SeedRepo;
  readonly institutions: Map<string, SeedInstitution>;
  readonly users: Map<string, MemorySeedUser>;
}

export function createMemorySeedRepo(): MemorySeedStore {
  const institutions = new Map<string, SeedInstitution>();
  const users = new Map<string, MemorySeedUser>();

  const repo: SeedRepo = {
    async findInstitutionByCode(code) {
      for (const institution of institutions.values()) {
        if (institution.code === code) return { ...institution };
      }
      return null;
    },

    async createInstitution(input) {
      institutions.set(input.id, { id: input.id, code: input.code, name: input.name });
    },

    async findUserByUsername(institutionId, username) {
      const needle = username.toLowerCase();
      for (const user of users.values()) {
        if (user.institutionId !== institutionId || user.status === "deleted") continue;
        if (user.username.toLowerCase() === needle) {
          return { ...user, roles: [...user.roles], simAccess: [...user.simAccess] };
        }
      }
      return null;
    },

    async createUser(input) {
      users.set(input.id, { ...input, roles: [...input.roles], simAccess: [...input.simAccess] });
    },
  };

  return { repo, institutions, users };
}
