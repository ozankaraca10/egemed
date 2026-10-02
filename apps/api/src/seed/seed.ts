import {
  SIM_IDS,
  displayNameSchema,
  usernameSchema,
  type Role,
  type SimId,
} from "@egemed/contracts";
import type { AuditRepo } from "../auth/repo";
import type { Env } from "../env";
import type { SeedInstitution, SeedRepo } from "./repo";

/**
 * T68 — kurulum tohumlarının çekirdeği (E3 §i/5 ilk admin, §a geliştirme
 * sağlayıcısı). Ağ ve veritabanı bağlantısı kurmaz; depo, saat ve kimlik
 * üretimi dışarıdan enjekte edilir, `Date.now()` kullanılmaz. Her tohum
 * idempotenttir: var olan kayıt yeniden yazılmaz.
 */

type SeedMode = "admin" | "dev";

export type SeedErrorCode =
  | "invalid_arguments"
  | "seed_admin_production_flag_required"
  | "seed_dev_disabled"
  | "seed_dev_production";

export class SeedError extends Error {
  readonly code: SeedErrorCode;

  constructor(code: SeedErrorCode, message: string) {
    super(message);
    this.name = "SeedError";
    this.code = code;
  }
}

export interface SeedDeps {
  readonly repo: SeedRepo;
  readonly audit: AuditRepo;
  readonly newId: () => string;
  readonly now: () => number;
}

interface SeedInstitutionInput {
  readonly code: string;
  readonly name: string;
}

/** E3 §i/5: geliştirme kurulumunun varsayılan kurumu (üretimde kullanılmaz). */
export const DEFAULT_DEV_INSTITUTION: SeedInstitutionInput = {
  code: "egemed-dev",
  name: "EGEMED Geliştirme",
};

interface SeedArgs {
  readonly mode: SeedMode;
  readonly username: string | undefined;
  readonly displayName: string | undefined;
  readonly allowProduction: boolean;
}

const SEED_MODES: readonly SeedMode[] = ["admin", "dev"];

function isSeedMode(value: string): value is SeedMode {
  return (SEED_MODES as readonly string[]).includes(value);
}

function splitFlag(arg: string): { readonly flag: string; readonly inline: string | undefined } {
  const separator = arg.indexOf("=");
  return separator === -1
    ? { flag: arg, inline: undefined }
    : { flag: arg.slice(0, separator), inline: arg.slice(separator + 1) };
}

/** Kip ilk argümandır; bilinmeyen bayrak ve eksik değer reddedilir. */
export function parseSeedArgs(args: readonly string[]): SeedArgs {
  const [mode, ...rest] = args;
  if (mode === undefined || !isSeedMode(mode)) {
    throw new SeedError("invalid_arguments", "Kip zorunludur: admin | dev.");
  }
  let username: string | undefined;
  let displayName: string | undefined;
  let allowProduction = false;

  for (let index = 0; index < rest.length; index += 1) {
    const { flag, inline } = splitFlag(rest[index] ?? "");
    const takeValue = (): string => {
      if (inline !== undefined) return inline;
      index += 1;
      const value = rest[index];
      if (value === undefined) {
        throw new SeedError("invalid_arguments", `${flag} değeri eksik.`);
      }
      return value;
    };
    const rejectDuplicate = (current: string | undefined): void => {
      if (current !== undefined) {
        throw new SeedError("invalid_arguments", `${flag} yalnız bir kez verilir.`);
      }
    };

    if (flag === "--username") {
      rejectDuplicate(username);
      username = takeValue();
    } else if (flag === "--display-name") {
      rejectDuplicate(displayName);
      displayName = takeValue();
    } else if (flag === "--allow-production") {
      if (inline !== undefined) {
        throw new SeedError("invalid_arguments", "--allow-production değer almaz.");
      }
      allowProduction = true;
    } else {
      throw new SeedError("invalid_arguments", `Bilinmeyen argüman: ${flag}`);
    }
  }

  return { mode, username, displayName, allowProduction };
}

interface SeedEnv {
  /** `SEED_INSTITUTION_CODE` ve `SEED_INSTITUTION_NAME` birlikte verilir; yoksa null. */
  readonly institution: SeedInstitutionInput | null;
  readonly adminUsername: string | undefined;
  readonly adminDisplayName: string | undefined;
  readonly allowProduction: boolean;
}

function emptyAsUndefined(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

/** Tohum ayarları ortamdan okunur; bayrak/çift kurum eksikliği burada yakalanır. */
export function loadSeedEnv(source: Record<string, string | undefined>): SeedEnv {
  const code = emptyAsUndefined(source.SEED_INSTITUTION_CODE);
  const name = emptyAsUndefined(source.SEED_INSTITUTION_NAME);
  if ((code === undefined) !== (name === undefined)) {
    throw new SeedError(
      "invalid_arguments",
      "SEED_INSTITUTION_CODE ve SEED_INSTITUTION_NAME birlikte verilir.",
    );
  }
  return {
    institution: code === undefined || name === undefined ? null : { code, name },
    adminUsername: emptyAsUndefined(source.SEED_ADMIN_USERNAME),
    adminDisplayName: emptyAsUndefined(source.SEED_ADMIN_DISPLAY_NAME),
    allowProduction: source.SEED_ALLOW_PRODUCTION === "true",
  };
}

interface SeedUserOutcome {
  readonly username: string;
  readonly outcome: "created" | "existing";
}

interface BootstrapAdminInput {
  readonly nodeEnv: Env["NODE_ENV"];
  readonly allowProduction: boolean;
  readonly institution: SeedInstitutionInput;
  readonly username: string;
  readonly displayName: string;
}

interface BootstrapAdminResult {
  readonly outcome: "created" | "existing";
  readonly userId: string;
  readonly institutionId: string;
}

function parseUsername(value: string): string {
  const parsed = usernameSchema.safeParse(value.trim());
  if (!parsed.success) {
    throw new SeedError(
      "invalid_arguments",
      "Kullanıcı adı biçimi geçersiz (küçük harf, 3–64 karakter: ^[a-z0-9][a-z0-9._-]{2,63}$).",
    );
  }
  return parsed.data;
}

function parseDisplayName(value: string): string {
  const parsed = displayNameSchema.safeParse(value);
  if (!parsed.success) {
    throw new SeedError("invalid_arguments", "Görünen ad 2–120 karakter olmalıdır.");
  }
  return parsed.data;
}

/** 001 migration CHECK'i ile aynı kurum kodu biçimi. */
const INSTITUTION_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

async function ensureInstitution(
  deps: SeedDeps,
  input: SeedInstitutionInput,
): Promise<SeedInstitution> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!INSTITUTION_CODE_PATTERN.test(code)) {
    throw new SeedError(
      "invalid_arguments",
      "Kurum kodu biçimi geçersiz: ^[a-z0-9][a-z0-9-]{1,31}$.",
    );
  }
  if (name.length < 2 || name.length > 200) {
    throw new SeedError("invalid_arguments", "Kurum adı 2–200 karakter olmalıdır.");
  }
  const existing = await deps.repo.findInstitutionByCode(code);
  if (existing !== null) return existing;
  const id = deps.newId();
  await deps.repo.createInstitution({ id, code, name, createdAt: deps.now() });
  return { id, code, name };
}

/** xAPI aktör kimliği tohum kullanıcıları için deterministiktir (users CHECK). */
function seedXapiActorId(userId: string): string {
  return `seed-${userId}`;
}

/**
 * İlk admin kurulum tohumu (E3 §i/5): kurumu (yoksa) ve `admin` rolünde SSO
 * kullanıcısını `invited` durumunda oluşturur; ilk giriş kaydı etkinleştirir.
 * Üretimde yalnız açık bayrakla çalışır. Oluşturma `bootstrap.admin` olarak
 * audit'lenir; ikinci çalıştırma hiçbir şey yazmaz.
 */
export async function seedBootstrapAdmin(
  deps: SeedDeps,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  if (input.nodeEnv === "production" && !input.allowProduction) {
    throw new SeedError(
      "seed_admin_production_flag_required",
      "Üretimde seed:admin yalnız --allow-production (ya da SEED_ALLOW_PRODUCTION=true) ile çalışır.",
    );
  }
  const username = parseUsername(input.username);
  const displayName = parseDisplayName(input.displayName);
  const institution = await ensureInstitution(deps, input.institution);
  const existing = await deps.repo.findUserByUsername(institution.id, username);
  if (existing !== null) {
    return { outcome: "existing", userId: existing.id, institutionId: institution.id };
  }

  const id = deps.newId();
  const at = deps.now();
  await deps.repo.createUser({
    id,
    institutionId: institution.id,
    username,
    displayName,
    authMethod: "sso",
    status: "invited",
    roles: ["admin"],
    simAccess: [],
    xapiActorId: seedXapiActorId(id),
    createdAt: at,
  });
  await deps.audit.insert({
    occurredAt: at,
    actorUserId: null,
    actorRole: null,
    institutionId: institution.id,
    action: "bootstrap.admin",
    targetType: "user",
    targetId: id,
    summaryAfter: { status: "invited", authMethod: "sso", roles: "admin", source: "seed:admin" },
    requestId: null,
  });
  return { outcome: "created", userId: id, institutionId: institution.id };
}

interface DevSeedUserSpec {
  readonly username: string;
  readonly displayName: string;
  readonly roles: readonly Role[];
  readonly simAccess: readonly SimId[];
}

/**
 * Kabuktaki sahte hesaplarla aynı kullanıcı adları (apps/shell/src/devAuth.ts
 * `DEV_ACCOUNTS`); test bunların eşitliğini doğrular.
 */
const DEV_SEED_USERS: readonly DevSeedUserSpec[] = [
  // API-03: sim uçları yetkiyi `sim_access` ile ister; geliştirme yöneticisi simleri deneyebilsin.
  { username: "admin", displayName: "Geliştirme Yöneticisi", roles: ["admin"], simAccess: [...SIM_IDS] },
  {
    username: "ogrenci",
    displayName: "Geliştirme Öğrencisi",
    roles: ["kullanici"],
    simAccess: [...SIM_IDS],
  },
];

interface DevSeedInput {
  readonly nodeEnv: Env["NODE_ENV"];
  readonly devEnabled: boolean;
  readonly institution: SeedInstitutionInput;
}

interface DevSeedResult {
  readonly institutionId: string;
  readonly users: readonly SeedUserOutcome[];
}

/**
 * Geliştirme kullanıcıları (E3 §a): yalnız `AUTH_DEV_ENABLED=true` ve üretim
 * dışı ortamda. Sentetik kayıtlar etkin ve `dev` yöntemlidir; ikinci çalıştırma
 * var olan kayıtları değiştirmez.
 */
export async function seedDevUsers(deps: SeedDeps, input: DevSeedInput): Promise<DevSeedResult> {
  if (input.nodeEnv === "production") {
    throw new SeedError("seed_dev_production", "seed:dev üretim ortamında çalışmaz.");
  }
  if (!input.devEnabled) {
    throw new SeedError("seed_dev_disabled", "seed:dev yalnız AUTH_DEV_ENABLED=true iken çalışır.");
  }
  const institution = await ensureInstitution(deps, input.institution);
  const users: SeedUserOutcome[] = [];
  for (const spec of DEV_SEED_USERS) {
    const existing = await deps.repo.findUserByUsername(institution.id, spec.username);
    if (existing !== null) {
      users.push({ username: spec.username, outcome: "existing" });
      continue;
    }
    const id = deps.newId();
    await deps.repo.createUser({
      id,
      institutionId: institution.id,
      username: spec.username,
      displayName: spec.displayName,
      authMethod: "dev",
      status: "active",
      roles: spec.roles,
      simAccess: spec.simAccess,
      xapiActorId: seedXapiActorId(id),
      createdAt: deps.now(),
    });
    users.push({ username: spec.username, outcome: "created" });
  }
  return { institutionId: institution.id, users };
}
