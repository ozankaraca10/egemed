import { createApp } from "../../apps/api/src/app";
import { createMemoryRewardsRepo } from "../../apps/api/src/rewards";
import { createMemorySimSessionRepo } from "../../apps/api/src/me/simSessions";
import { createMemoryChallengeRepo } from "../../apps/api/src/me/challenges";
import { createMemoryLearnRepo } from "../../apps/api/src/me/learn";
import { createMemoryAdminBulkRepo, type AdminBulkRepo } from "../../apps/api/src/admin/bulk";
import { createMemoryAdminOverviewRepo, type AdminOverviewMemoryData } from "../../apps/api/src/admin/extras";
import {
  createMemoryAdminImportRepo,
  type MemoryAdminImportStore,
} from "../../apps/api/src/admin/imports";
import { createMemoryAdminRoleRepo } from "../../apps/api/src/admin/roles";
import {
  createMemoryAdminStore,
  type MemoryAdminUserSeed,
} from "../../apps/api/src/admin/users";
import { createMemoryIntegrityRepo } from "../../apps/api/src/integrity/repo";
import { createMemoryCompetitionBansRepo } from "../../apps/api/src/integrity/bans";
import { createMemoryAuthStore, type MemoryUserSeed } from "../../apps/api/src/auth/repo";
import type { AuthDeps } from "../../apps/api/src/auth/routes";
import {
  createMemoryGamificationRepo,
  type MemoryGamificationSeed,
} from "../../apps/api/src/me/gamification";
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  DEFAULT_SESSION_ABSOLUTE_MS,
  DEFAULT_SESSION_IDLE_MS,
  SESSION_COOKIE,
} from "../../apps/api/src/auth/session";
import type { AuthMethod, Role, SimId, UserStatus } from "../../packages/contracts/src/index";

// T66 — `/admin/users/bulk`, `/admin/users/:id/roles` ve `/admin/imports`
// testleri için ortak koşum: bellek depoları, enjekte edilen sabit saat ve
// sayaçlı kimlik üretimi. DB gerekmez; hiçbir test gerçek veri taşımaz.

export const FIXED_NOW = 1_700_000_000_000;
export const SEED_CREATED_AT = FIXED_NOW - 1000;
export const INSTITUTION_ID = "00000000-0000-4000-8000-000000000010";
export const OTHER_INSTITUTION_ID = "00000000-0000-4000-8000-000000000099";
export const UNIT_ID = "00000000-0000-4000-8000-000000000020";
export const UNIT_CODE = "3-sinif";
export const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
export const MERT_ID = "00000000-0000-4000-8000-000000000002";
export const ALI_ID = "00000000-0000-4000-8000-000000000011";
export const BORA_ID = "00000000-0000-4000-8000-000000000012";
export const CEREN_ID = "00000000-0000-4000-8000-000000000013";
export const DERYA_ID = "00000000-0000-4000-8000-000000000014";
export const EGE_ID = "00000000-0000-4000-8000-000000000015";

export interface HarnessUser {
  readonly id: string;
  readonly institutionId: string;
  readonly unitId: string | null;
  readonly username: string | null;
  readonly email: string | null;
  readonly displayName: string;
  readonly authMethod: AuthMethod;
  readonly status: UserStatus;
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
  /** T58 — `/admin/overview` son 7 gün penceresi için sabit son giriş anı. */
  readonly lastLoginAt?: number | null;
}

export function user(overrides: Partial<HarnessUser> & { readonly id: string }): HarnessUser {
  return {
    institutionId: INSTITUTION_ID,
    unitId: null,
    username: null,
    email: null,
    displayName: "Örnek Kullanıcı",
    authMethod: "sso",
    status: "active",
    roles: ["kullanici"],
    simAccess: [],
    lastLoginAt: null,
    ...overrides,
  };
}

export const ADMIN_USER = user({
  id: ADMIN_ID,
  username: "ornek.yonetici",
  email: "yonetici@example.invalid",
  displayName: "Deniz Yönetici",
  authMethod: "dev",
  roles: ["admin"],
  simAccess: ["pulse", "ausculta", "opaca"],
});
export const MERT = user({
  id: MERT_ID,
  username: "mert.ikinci",
  email: "mert@example.invalid",
  displayName: "Mert İkinci",
  authMethod: "dev",
  roles: ["admin", "kullanici"],
});
export const ALI = user({
  id: ALI_ID,
  username: "ali.veli",
  email: "ali.veli@example.invalid",
  displayName: "Ali Veli",
  authMethod: "dev",
  unitId: UNIT_ID,
  simAccess: ["pulse"],
});
export const BORA = user({
  id: BORA_ID,
  username: "bora.kaya",
  email: "bora.kaya@example.invalid",
  displayName: "Bora Kaya",
  status: "suspended",
  simAccess: ["opaca"],
});
export const CEREN = user({
  id: CEREN_ID,
  username: "ceren.demir",
  email: "ceren.demir@example.invalid",
  displayName: "Ceren Demir",
  status: "invited",
});
export const EGE = user({
  id: EGE_ID,
  username: "ege.olgun",
  email: "ege.olgun@example.invalid",
  displayName: "Ege Olgun",
  roles: [],
});
export const DERYA = user({
  id: DERYA_ID,
  username: "derya.uzak",
  email: "derya.uzak@example.invalid",
  displayName: "Derya Uzak",
  institutionId: OTHER_INSTITUTION_ID,
});

/** Liste varsayılanı, T65 testleriyle aynı sırayı korur (alfabetik ad). */
export const DEFAULT_USERS: readonly HarnessUser[] = [ADMIN_USER, MERT, ALI, BORA, CEREN, DERYA, EGE];
export const UNITS = [
  { id: UNIT_ID, institutionId: INSTITUTION_ID, code: UNIT_CODE, name: "3. Sınıf" },
];

export function generatedId(position: number): string {
  return `10000000-0000-4000-8000-${String(position).padStart(12, "0")}`;
}

function toAuthSeed(seed: HarnessUser): MemoryUserSeed {
  return {
    id: seed.id,
    username: seed.username,
    displayName: seed.displayName,
    authMethod: seed.authMethod,
    status: seed.status,
    institutionId: seed.institutionId,
    institutionName: "Örnek Kurum",
    roles: seed.roles,
    simAccess: seed.simAccess,
  };
}

function toAdminSeed(seed: HarnessUser): MemoryAdminUserSeed {
  return {
    id: seed.id,
    institutionId: seed.institutionId,
    unitId: seed.unitId,
    username: seed.username,
    email: seed.email,
    displayName: seed.displayName,
    authMethod: seed.authMethod,
    status: seed.status,
    roles: seed.roles,
    simAccess: seed.simAccess,
    createdAt: SEED_CREATED_AT,
    lastLoginAt: seed.lastLoginAt ?? null,
  };
}

function fakeDb() {
  return {
    query() {
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
}

export function createAdminHarness(
  options: {
    readonly users?: readonly HarnessUser[];
    /** T67 — `/me/gamification` testleri için sentetik oyunlaştırma tohumu. */
    readonly gamification?: MemoryGamificationSeed;
    /** T58 — `/admin/health` için havuz yoklaması; varsayılan her zaman sağlıklıdır. */
    readonly db?: { query(text: string, params: readonly unknown[]): Promise<unknown> };
    readonly lrsProbe?: () => Promise<boolean>;
    readonly overviewSimData?: AdminOverviewMemoryData;
    /** T87 — PostgreSQL satır şeklini taklit eden toplu işlem deposu. */
    readonly bulk?: AdminBulkRepo;
    /** A1.3 — sunucu vaka oturumu; ses okuyucu ve deterministik jeton/rastgele. */
    readonly readAudio?: (runtimeUrl: string) => Promise<Uint8Array | null>;
    /** A2.2 — Opaca görüntü vekili; görüntü okuyucu. */
    readonly readImage?: (runtimeUrl: string) => Promise<Uint8Array | null>;
  } = {},
) {
  const users = options.users ?? DEFAULT_USERS;
  const authStore = createMemoryAuthStore({ users: users.map(toAuthSeed) });
  const gamificationStore = createMemoryGamificationRepo(options.gamification ?? {});
  const adminStore = createMemoryAdminStore({
    users: users.map(toAdminSeed),
    units: UNITS,
  });
  let clock = FIXED_NOW;
  let generated = 0;
  const newId = () => {
    generated += 1;
    return generatedId(generated);
  };
  const auth: AuthDeps = {
    sessions: authStore.repos.sessions,
    users: authStore.repos.users,
    audit: authStore.repos.audit,
    nodeEnv: "development",
    devEnabled: true,
    sessionIdleMs: DEFAULT_SESSION_IDLE_MS,
    sessionAbsoluteMs: DEFAULT_SESSION_ABSOLUTE_MS,
  };
  const importStore: MemoryAdminImportStore = createMemoryAdminImportRepo(adminStore, newId);
  const rewards = createMemoryRewardsRepo();
  const simSessions = createMemorySimSessionRepo();
  const challenges = createMemoryChallengeRepo();
  const learn = createMemoryLearnRepo();
  const userLookup = async (userId: string) => {
    const context = await authStore.repos.users.getMeContext(userId);
    return context === null ? null : { institutionId: context.institution.id, displayName: context.displayName };
  };
  const integrity = createMemoryIntegrityRepo(userLookup);
  const bans = createMemoryCompetitionBansRepo(userLookup);
  let tokenCounter = 0;
  let randomSeed = 42;
  let idCounter = 0;
  const app = createApp({
    db: options.db ?? fakeDb(),
    now: () => clock,
    auth,
    gamification: gamificationStore.repo,
    overview: createMemoryAdminOverviewRepo(adminStore, importStore, options.overviewSimData),
    ...(options.lrsProbe === undefined ? {} : { lrsProbe: options.lrsProbe }),
    rewards,
    challenges,
    learn,
    integrity,
    bans,
    simSessions: {
      sessions: simSessions,
      readAudio: options.readAudio ?? (() => Promise.resolve(null)),
      readImage: options.readImage ?? (() => Promise.resolve(null)),
      newToken: () => `tok_${(tokenCounter++).toString(36).padStart(12, "0")}`,
      random: () => {
        randomSeed = (randomSeed * 16807) % 2147483647;
        return randomSeed / 2147483647;
      },
      newId: () => generatedId(9000 + idCounter++),
    },
    admin: {
      auth,
      users: adminStore.users,
      bulk: options.bulk ?? createMemoryAdminBulkRepo(adminStore),
      roles: createMemoryAdminRoleRepo(adminStore),
      imports: importStore.repo,
      newId,
    },
  });
  return {
    app,
    authStore,
    adminStore,
    importStore,
    gamificationStore,
    rewards,
    simSessions,
    challenges,
    learn,
    integrity,
    bans,
    advance(ms: number) {
      clock += ms;
    },
  };
}

export type AdminHarness = ReturnType<typeof createAdminHarness>;

interface CookieResponse {
  readonly headers: { getSetCookie(): string[] };
}

export function cookieValue(response: CookieResponse, name: string): string | undefined {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${name}=`));
  return header === undefined ? undefined : header.slice(name.length + 1).split(";")[0];
}

export interface Login {
  readonly headers: Record<string, string>;
  readonly token: string;
}

export async function login(harness: AdminHarness, username: string): Promise<Login> {
  const response = await harness.app.request("/auth/dev/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (response.status !== 200) {
    throw new Error(`Giriş başarısız: ${username} (${response.status})`);
  }
  const token = cookieValue(response, SESSION_COOKIE) ?? "";
  const csrf = cookieValue(response, CSRF_COOKIE) ?? "";
  return {
    headers: { cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${csrf}`, [CSRF_HEADER]: csrf },
    token,
  };
}

export function auditActions(harness: AdminHarness): string[] {
  return harness.authStore.auditEntries.map((entry) => entry.action);
}
