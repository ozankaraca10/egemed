import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  checkDevCredentials,
  createSessionStore,
  DEV_ACCOUNTS,
  DEV_SESSION_KEY,
  isDevAuthEnabled,
  sessionWhenEnabled,
  type DevSession,
  type DevSessionStorage,
} from "../../apps/shell/src/devAuth";
import {
  ADMIN_PATH,
  adminGuardHref,
  adminHref,
  entryRedirectHref,
  ROUTES,
  resolveRoute,
} from "../../apps/shell/src/routes";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { describe, expect, it } from "vitest";

const ADMIN: DevSession = { actorId: "dev-admin-0001", role: "admin" };
const STUDENT: DevSession = { actorId: "dev-student-0001", role: "student" };

/** Bellek içi sahte depo; oturum akışı DOM'suz doğrulanır. */
function memoryStorage(): DevSessionStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

describe("checkDevCredentials", () => {
  it("rolünün hesabını kabul eder, sentetik aktör kimliğiyle oturum üretir", () => {
    expect(DEV_ACCOUNTS).toEqual({
      admin: { password: "egemed", username: "admin" },
      student: { password: "egemed", username: "ogrenci" },
    });
    expect(checkDevCredentials("admin", "admin", "egemed")).toEqual(ADMIN);
    expect(checkDevCredentials("student", "ogrenci", "egemed")).toEqual(STUDENT);
  });
  it("büyük harf/boşluğu yok sayar, parolayı birebir arar, rol karışmasını reddeder", () => {
    expect(checkDevCredentials("admin", "  ADMIN ", "egemed")).toEqual(ADMIN);
    expect(checkDevCredentials("student", "\tOgrenci\n", "egemed")).toEqual(STUDENT);
    expect(checkDevCredentials("admin", "admin", " egemed")).toBeNull();
    expect(checkDevCredentials("admin", "admin", "EGEMED")).toBeNull();
    expect(checkDevCredentials("admin", "admin", "yanlis")).toBeNull();
    expect(checkDevCredentials("admin", "ogrenci", "egemed")).toBeNull();
    expect(checkDevCredentials("student", "admin", "egemed")).toBeNull();
  });
});

describe("createSessionStore", () => {
  it("yazar, okur ve temizler", () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    expect(store.read()).toBeNull();
    store.write(STUDENT);
    expect(storage.entries.get(DEV_SESSION_KEY)).toBe(JSON.stringify(STUDENT));
    expect(store.read()).toEqual(STUDENT);
    store.clear();
    expect(storage.entries.has(DEV_SESSION_KEY)).toBe(false);
    expect(store.read()).toBeNull();
  });
  it("bozuk JSON, bilinmeyen rol ve tutarsız aktörde null döner", () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);
    for (const raw of [
      "{bozuk",
      JSON.stringify({ actorId: "dev-admin-0001", role: "root" }),
      JSON.stringify({ actorId: "dev-student-0001", role: "admin" }),
    ]) {
      storage.setItem(DEV_SESSION_KEY, raw);
      expect(store.read(), raw).toBeNull();
    }
  });
});

describe("isDevAuthEnabled ve admin koruması", () => {
  it("yalnız DEV true iken açıktır", () => {
    expect(isDevAuthEnabled({ DEV: true })).toBe(true);
    expect(isDevAuthEnabled({ DEV: false })).toBe(false);
  });
  it("admin oturumu yoksa girişe yönlendirir, varsa engellemez", () => {
    expect(adminGuardHref(null)).toBe("#/giris/admin");
    expect(adminGuardHref(STUDENT)).toBe("#/giris/admin");
    expect(adminGuardHref(ADMIN)).toBeNull();
  });
  it("dev kapalıyken geçerli depo kaydı olsa bile oturum yoktur; admin koruması yönlendirir", () => {
    const storage = memoryStorage();
    createSessionStore(storage).write(ADMIN);
    let reads = 0;
    const counting: DevSessionStorage = {
      getItem: (key) => {
        reads += 1;
        return storage.getItem(key);
      },
      removeItem: (key) => {
        storage.removeItem(key);
      },
      setItem: (key, value) => {
        storage.setItem(key, value);
      },
    };
    const off = sessionWhenEnabled(false, createSessionStore(counting));
    expect(off).toBeNull();
    expect(reads).toBe(0);
    expect(adminGuardHref(off)).toBe("#/giris/admin");
    const on = sessionWhenEnabled(true, createSessionStore(storage));
    expect(on).toEqual(ADMIN);
    expect(adminGuardHref(on)).toBeNull();
  });
});

describe("#/admin rotası, hedef ve gezinme koruması", () => {
  it("rotayı çözer, hedefi role göre belirler, ana gezinmede göstermez", () => {
    expect(ADMIN_PATH).toBe("/admin");
    expect(adminHref()).toBe("#/admin");
    expect(entryRedirectHref("admin")).toBe("#/admin");
    expect(entryRedirectHref("student")).toBe("#/");
    for (const hash of ["#/admin", "#/admin/", "#/admin?x=1"]) {
      expect(resolveRoute(hash), hash).toEqual({ kind: "admin", titleKey: "admin.title" });
    }
    expect(ROUTES.some((route) => route.path === ADMIN_PATH)).toBe(false);
    const nav = renderToStaticMarkup(
      createElement(ShellLayout, { children: null, route: resolveRoute("#/") }),
    );
    expect(nav).not.toContain('href="#/admin"');
  });
});
