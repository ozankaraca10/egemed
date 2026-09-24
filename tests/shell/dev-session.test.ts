import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminPage } from "../../apps/shell/src/AdminPage";
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
import { EntryPage, submitDevEntry, type DevSubmitHandlers } from "../../apps/shell/src/EntryPage";
import {
  ADMIN_PATH,
  adminAuditHref,
  adminGuardHref,
  adminHref,
  adminImportHref,
  adminRolesHref,
  adminUsersHref,
  entryRedirectHref,
  ROUTES,
  resolveRoute,
} from "../../apps/shell/src/routes";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { shellSessionFromDev } from "../../apps/shell/src/session";
import { t } from "../../packages/ui/i18n/tr";
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

describe("#/admin rotası ve AdminPage", () => {
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
  it("tek h1, giriş metni, yedi bölüm gösterir; 'Kullanıcılar'/'Roller ve erişim'/'Toplu içe aktarma'/'Denetim günlüğü' bağlanır, kalanı 'Yakında' rozetlidir", () => {
    const html = renderToStaticMarkup(createElement(AdminPage));
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain(t("admin.title"));
    expect(html).toContain(t("admin.intro"));
    expect((html.match(/class="eg-card"/g) ?? []).length).toBe(7);
    for (const key of [
      "admin.section.overview",
      "admin.section.users",
      "admin.section.rolesAccess",
      "admin.section.roles",
      "admin.section.sims",
      "admin.section.integrations",
      "admin.section.audit",
    ] as const) {
      expect(html).toContain(t(key));
    }
    // Üç bölüm hâlâ "Yakında"; "Kullanıcılar", "Roller ve erişim", "Toplu içe aktarma" (T71) ve
    // "Denetim günlüğü" (T73) gerçek bağlantıya sahiptir.
    expect(html.split(t("admin.soon")).length - 1).toBe(3);
    expect(html).not.toContain("<button");
    expect((html.match(/<a\b/g) ?? []).length).toBe(4);
    expect(html).toContain(`<a class="eg-shell-admin__link" href="${adminUsersHref()}">${t("admin.users.open")}</a>`);
    expect(html).toContain(`<a class="eg-shell-admin__link" href="${adminRolesHref()}">${t("admin.roles.open")}</a>`);
    expect(html).toContain(`<a class="eg-shell-admin__link" href="${adminImportHref()}">${t("admin.import.open")}</a>`);
    expect(html).toContain(`<a class="eg-shell-admin__link" href="${adminAuditHref()}">${t("admin.audit.open")}</a>`);
  });
});

describe("EntryPage dev davranışı", () => {
  it("dev kapalıyken ipucu kutusu yoktur; önizleme metni ve form korunur", () => {
    const html = renderToStaticMarkup(createElement(EntryPage, { role: "admin" }));
    expect(html).not.toContain(t("entry.dev.title"));
    expect(html).not.toContain(t("entry.dev.admin"));
    expect(html).not.toContain(t("entry.dev.note"));
    expect(html).toContain(t("entry.auth.pending"));
    expect(html).toContain('class="eg-shell-entry__form"');
    expect(html).not.toContain('role="alert"');
  });
  it("dev açıkken rolün hesabını ve notu gösterir, önizleme satırını gizler", () => {
    const admin = renderToStaticMarkup(createElement(EntryPage, { devEnabled: true, role: "admin" }));
    expect(admin).toContain(t("entry.dev.title"));
    expect(admin).toContain(t("entry.dev.admin"));
    expect(admin).toContain(t("entry.dev.note"));
    expect(admin).not.toContain(t("entry.auth.pending"));
    expect(admin).not.toContain(t("entry.error.invalid"));
    const student = renderToStaticMarkup(createElement(EntryPage, { devEnabled: true, role: "student" }));
    expect(student).toContain(t("entry.dev.student"));
    expect(student).not.toContain(t("entry.dev.admin"));
  });
});

describe("submitDevEntry", () => {
  it("doğru kimlikte oturumu kaydeder ve role göre yönlendirir", () => {
    let prevented = 0;
    const store = createSessionStore(memoryStorage());
    const navigated: string[] = [];
    const handlers: DevSubmitHandlers = {
      onInvalid: () => {
        throw new Error("Hatalı kimlik beklenmiyordu");
      },
      onSignedIn: (signedIn) => {
        store.write(signedIn);
        navigated.push(entryRedirectHref(signedIn.role));
      },
    };
    const session = submitDevEntry(
      { preventDefault: () => { prevented += 1; } },
      { password: "egemed", username: "ADMIN" },
      "admin",
      handlers,
    );
    expect(session).toEqual(ADMIN);
    expect(store.read()).toEqual(ADMIN);
    expect(navigated).toEqual(["#/admin"]);
    expect(prevented).toBe(1);
  });
  it("yanlış kimlikte hata bildirir, oturum üretmez", () => {
    let invalid = 0;
    const session = submitDevEntry(
      { preventDefault: () => undefined },
      { password: "yanlis", username: "admin" },
      "student",
      { onInvalid: () => { invalid += 1; }, onSignedIn: () => { throw new Error("Beklenmiyordu"); } },
    );
    expect(session).toBeNull();
    expect(invalid).toBe(1);
  });
});

describe("ShellLayout oturum göstergesi", () => {
  const layout = (session: DevSession | null): string =>
    renderToStaticMarkup(
      createElement(ShellLayout, {
        children: null,
        route: resolveRoute("#/"),
        session: session === null ? null : shellSessionFromDev(session),
      }),
    );

  it("göstergeyi yalnız oturum varken çizer; rol etiketi, çıkış ve şerit birlikte gelir", () => {
    const none = layout(null);
    const admin = layout(ADMIN);
    const student = layout(STUDENT);
    for (const key of [
      "shell.session.admin",
      "shell.session.student",
      "shell.session.logout",
      "shell.session.banner",
    ] as const) {
      expect(none).not.toContain(t(key));
    }
    expect(admin).toContain(t("shell.session.admin"));
    expect(admin).not.toContain(t("shell.session.student"));
    expect(admin).toContain(t("shell.session.logout"));
    expect(admin).toContain(t("shell.session.banner"));
    expect(admin).toContain('type="button"');
    expect(student).toContain(t("shell.session.student"));
    expect(student).not.toContain(t("shell.session.admin"));
  });
});
