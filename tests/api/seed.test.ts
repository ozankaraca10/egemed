import { describe, expect, it } from "vitest";
import { SIM_IDS } from "../../packages/contracts/src/index";
import { createMemoryAuthStore } from "../../apps/api/src/auth/repo";
import {
  createMemorySeedRepo,
  createPgSeedRepo,
  type MemorySeedStore,
  type MemorySeedUser,
} from "../../apps/api/src/seed/repo";
import {
  DEFAULT_DEV_INSTITUTION,
  SeedError,
  loadSeedEnv,
  parseSeedArgs,
  seedBootstrapAdmin,
  seedDevUsers,
  type SeedDeps,
  type SeedErrorCode,
} from "../../apps/api/src/seed/seed";
import { DEV_ACCOUNTS } from "../../apps/shell/src/devAuth";

// T68 — kurulum tohumları (E3 §i/5 ilk admin, §a geliştirme sağlayıcısı):
// idempotentlik, üretim kapıları, `bootstrap.admin` audit'i ve parametreli
// sorgular. DB gerekmez; bellek deposu ve enjekte edilen sabit saat kullanılır.
// Hiçbir kayıt gerçek kişi verisi taşımaz.

const FIXED_NOW = 1_700_000_000_000;
const INSTITUTION = { code: "egemed-test", name: "Örnek Sağlık Kurumu" };

function generatedId(position: number): string {
  return `20000000-0000-4000-8000-${String(position).padStart(12, "0")}`;
}

function createSeedHarness() {
  const store = createMemorySeedRepo();
  const authStore = createMemoryAuthStore();
  let generated = 0;
  const deps: SeedDeps = {
    repo: store.repo,
    audit: authStore.repos.audit,
    newId: () => {
      generated += 1;
      return generatedId(generated);
    },
    now: () => FIXED_NOW,
  };
  return { store, authStore, deps };
}

function userByUsername(store: MemorySeedStore, username: string): MemorySeedUser {
  const found = [...store.users.values()].find((user) => user.username === username);
  if (found === undefined) throw new Error(`Kullanıcı bulunamadı: ${username}`);
  return found;
}

async function expectSeedError(promise: Promise<unknown>, code: SeedErrorCode): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SeedError);
    expect((error as SeedError).code).toBe(code);
    return;
  }
  throw new Error(`SeedError bekleniyordu: ${code}`);
}

describe("seed:dev — geliştirme kullanıcıları (E3 §a)", () => {
  it("kabuktaki sahte hesaplarla aynı kullanıcı adlarını ve rolleri tohumlar", async () => {
    const harness = createSeedHarness();
    const result = await seedDevUsers(harness.deps, {
      nodeEnv: "development",
      devEnabled: true,
      institution: DEFAULT_DEV_INSTITUTION,
    });

    expect(result.users.map((user) => user.username)).toEqual([
      DEV_ACCOUNTS.admin.username,
      DEV_ACCOUNTS.student.username,
    ]);
    expect(harness.store.institutions.get(result.institutionId)?.code).toBe("egemed-dev");

    const admin = userByUsername(harness.store, DEV_ACCOUNTS.admin.username);
    expect(admin).toMatchObject({ authMethod: "dev", status: "active", roles: ["admin"], simAccess: ["pulse", "ausculta", "opaca"] });
    const student = userByUsername(harness.store, DEV_ACCOUNTS.student.username);
    expect(student).toMatchObject({ authMethod: "dev", status: "active", roles: ["kullanici"] });
    expect(student.simAccess).toEqual([...SIM_IDS]);
    expect(harness.authStore.auditEntries).toEqual([]);
  });

  it("idempotenttir: ikinci çalıştırma kurum ve kullanıcı yazmaz", async () => {
    const harness = createSeedHarness();
    const input = { nodeEnv: "development", devEnabled: true, institution: INSTITUTION } as const;
    const first = await seedDevUsers(harness.deps, input);
    const userIds = [...harness.store.users.keys()].sort();

    const second = await seedDevUsers(harness.deps, input);
    expect(second.institutionId).toBe(first.institutionId);
    expect(second.users.map((user) => user.outcome)).toEqual(["existing", "existing"]);
    expect([...harness.store.users.keys()].sort()).toEqual(userIds);
    expect(harness.store.institutions.size).toBe(1);
  });

  it("AUTH_DEV_ENABLED kapalıyken reddeder ve hiçbir kayıt yazmaz", async () => {
    const harness = createSeedHarness();
    await expectSeedError(
      seedDevUsers(harness.deps, {
        nodeEnv: "development",
        devEnabled: false,
        institution: INSTITUTION,
      }),
      "seed_dev_disabled",
    );
    expect(harness.store.users.size).toBe(0);
    expect(harness.store.institutions.size).toBe(0);
  });

  it("üretimde reddeder ve hiçbir kayıt yazmaz", async () => {
    const harness = createSeedHarness();
    await expectSeedError(
      seedDevUsers(harness.deps, {
        nodeEnv: "production",
        devEnabled: true,
        institution: INSTITUTION,
      }),
      "seed_dev_production",
    );
    expect(harness.store.users.size).toBe(0);
    expect(harness.store.institutions.size).toBe(0);
  });
});

describe("seed:admin — ilk admin tohumu (E3 §i/5)", () => {
  const input = {
    nodeEnv: "production",
    allowProduction: true,
    institution: INSTITUTION,
    username: "kurucu.admin",
    displayName: "Kurucu Yönetici",
  } as const;

  it("kurumu ve invited SSO admin'ini oluşturur; bootstrap.admin audit yazar", async () => {
    const harness = createSeedHarness();
    const result = await seedBootstrapAdmin(harness.deps, input);

    expect(result.outcome).toBe("created");
    expect(harness.store.institutions.get(result.institutionId)?.code).toBe(INSTITUTION.code);
    const created = harness.store.users.get(result.userId);
    expect(created).toMatchObject({
      username: "kurucu.admin",
      displayName: "Kurucu Yönetici",
      authMethod: "sso",
      status: "invited",
      roles: ["admin"],
      simAccess: [],
    });
    expect(created?.xapiActorId).toBe(`seed-${result.userId}`);

    expect(harness.authStore.auditEntries).toHaveLength(1);
    const entry = harness.authStore.auditEntries[0];
    expect(entry).toMatchObject({
      occurredAt: FIXED_NOW,
      actorUserId: null,
      actorRole: null,
      institutionId: result.institutionId,
      action: "bootstrap.admin",
      targetType: "user",
      targetId: result.userId,
      requestId: null,
    });
    expect(entry?.summaryAfter).toEqual({
      status: "invited",
      authMethod: "sso",
      roles: "admin",
      source: "seed:admin",
    });
    expect(JSON.stringify(entry)).not.toContain("kurucu.admin");
  });

  it("idempotenttir: ikinci çalıştırma yalnız 'existing' döner, audit büyümez", async () => {
    const harness = createSeedHarness();
    const first = await seedBootstrapAdmin(harness.deps, input);
    const second = await seedBootstrapAdmin(harness.deps, input);

    expect(second).toEqual({ outcome: "existing", userId: first.userId, institutionId: first.institutionId });
    expect(harness.store.users.size).toBe(1);
    expect(harness.store.institutions.size).toBe(1);
    expect(harness.authStore.auditEntries).toHaveLength(1);
  });

  it("üretimde açık bayrak olmadan reddeder", async () => {
    const harness = createSeedHarness();
    await expectSeedError(
      seedBootstrapAdmin(harness.deps, { ...input, allowProduction: false }),
      "seed_admin_production_flag_required",
    );
    expect(harness.store.users.size).toBe(0);
    expect(harness.authStore.auditEntries).toEqual([]);
  });

  it("üretim dışında bayraksız çalışır", async () => {
    const harness = createSeedHarness();
    const result = await seedBootstrapAdmin(harness.deps, {
      ...input,
      nodeEnv: "development",
      allowProduction: false,
    });
    expect(result.outcome).toBe("created");
  });

  it("geçersiz kullanıcı adı, görünen ad ve kurum kodunu reddeder", async () => {
    const harness = createSeedHarness();
    await expectSeedError(
      seedBootstrapAdmin(harness.deps, { ...input, username: "Kurucu.Admin" }),
      "invalid_arguments",
    );
    await expectSeedError(
      seedBootstrapAdmin(harness.deps, { ...input, displayName: "A" }),
      "invalid_arguments",
    );
    await expectSeedError(
      seedBootstrapAdmin(harness.deps, { ...input, institution: { code: "Kurum-1", name: "Kurum" } }),
      "invalid_arguments",
    );
    expect(harness.store.users.size).toBe(0);
  });
});

describe("parseSeedArgs", () => {
  it("kip, kullanıcı adı, görünen ad ve üretim bayrağını çözer", () => {
    expect(parseSeedArgs(["admin", "--username", "ali.veli", "--display-name=Ali Veli"])).toEqual({
      mode: "admin",
      username: "ali.veli",
      displayName: "Ali Veli",
      allowProduction: false,
    });
    expect(parseSeedArgs(["dev", "--allow-production"])).toEqual({
      mode: "dev",
      username: undefined,
      displayName: undefined,
      allowProduction: true,
    });
  });

  it("bilinmeyen, eksik ve yinelenen argümanı reddeder", () => {
    for (const args of [
      [],
      ["tohum"],
      ["admin", "--eposta", "a@b.c"],
      ["admin", "--username"],
      ["admin", "--username", "ali.veli", "--username", "veli.ali"],
      ["admin", "--allow-production=true"],
    ]) {
      expect(() => parseSeedArgs(args), args.join(" ")).toThrow(SeedError);
    }
  });
});

describe("loadSeedEnv", () => {
  it("kurum çiftini, admin varsayılanlarını ve bayrağı okur", () => {
    expect(
      loadSeedEnv({
        SEED_INSTITUTION_CODE: "kurum-1",
        SEED_INSTITUTION_NAME: "Örnek Kurum",
        SEED_ADMIN_USERNAME: "kurucu.admin",
        SEED_ADMIN_DISPLAY_NAME: "Kurucu Yönetici",
        SEED_ALLOW_PRODUCTION: "true",
      }),
    ).toEqual({
      institution: { code: "kurum-1", name: "Örnek Kurum" },
      adminUsername: "kurucu.admin",
      adminDisplayName: "Kurucu Yönetici",
      allowProduction: true,
    });
  });

  it("eksik kurum alanını ve boş değerleri yok sayar", () => {
    expect(loadSeedEnv({})).toEqual({
      institution: null,
      adminUsername: undefined,
      adminDisplayName: undefined,
      allowProduction: false,
    });
    expect(() => loadSeedEnv({ SEED_INSTITUTION_CODE: "kurum-1" })).toThrow(SeedError);
    expect(() => loadSeedEnv({ SEED_INSTITUTION_NAME: "Örnek Kurum" })).toThrow(SeedError);
  });
});

describe("parametreli sorgular (SeedRepo)", () => {
  interface FakeCall {
    readonly text: string;
    readonly params: readonly unknown[];
  }

  function createFakeDb() {
    const calls: FakeCall[] = [];
    return {
      calls,
      query(text: string, params: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }> {
        calls.push({ text, params });
        return Promise.resolve({ rows: [] });
      },
    };
  }

  it("pg deposu kullanıcı girdisini SQL metnine gömmez; değerleri parametre taşır", async () => {
    const db = createFakeDb();
    const repo = createPgSeedRepo(db);
    const institutionId = generatedId(1);
    const userId = generatedId(2);

    await repo.findInstitutionByCode("kurum-1");
    await repo.createInstitution({
      id: institutionId,
      code: "kurum-1",
      name: "Örnek Kurum",
      createdAt: FIXED_NOW,
    });
    await repo.findUserByUsername(institutionId, "ali.veli");
    await repo.createUser({
      id: userId,
      institutionId,
      username: "ali.veli",
      displayName: "Ali Veli",
      authMethod: "dev",
      status: "active",
      roles: ["kullanici"],
      simAccess: ["pulse"],
      xapiActorId: "seed-x",
      createdAt: FIXED_NOW,
    });

    const sql = db.calls.map((call) => call.text).join("\n");
    for (const needle of ["kurum-1", "Örnek Kurum", "ali.veli", "Ali Veli", "seed-x"]) {
      expect(sql, needle).not.toContain(needle);
    }
    expect(db.calls.every((call) => call.text.includes("$1"))).toBe(true);
    expect(db.calls[3]?.params).toEqual([
      userId,
      institutionId,
      "ali.veli",
      "Ali Veli",
      "dev",
      "active",
      "seed-x",
      new Date(FIXED_NOW),
      ["kullanici"],
      ["pulse"],
    ]);
  });
});
