import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { t } from "../../packages/ui/i18n/tr";
import { ShellLayout } from "../../apps/shell/src/ShellLayout";
import { resolveRoute, routeHref } from "../../apps/shell/src/routes";
import { isFacultyLike, isLearnUnlocked, shellSessionFromDev, shellSessionFromMe } from "../../apps/shell/src/session";
import { VISITOR_STORAGE_KEY, audienceFor, endVisitor, readVisitor, startVisitor } from "../../apps/shell/src/visitor";

// Ziyaretçi modu ve kitle (26 Eyl 2026): oturum yoksa ziyaretçi işareti/üretim → visitor;
// öğretim üyesi ve uzmanlık öğrencisi (T219) → faculty; aksi halde student.

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("ziyaretçi işareti", () => {
  it("başlatılır, okunur ve temizlenir; depo hatası gezinmeyi bozmaz", () => {
    const store = memory();
    expect(readVisitor(store)).toBe(false);
    startVisitor(store);
    expect(store.getItem(VISITOR_STORAGE_KEY)).toBe("1");
    expect(readVisitor(store)).toBe(true);
    endVisitor(store);
    expect(readVisitor(store)).toBe(false);
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
    expect(readVisitor(broken)).toBe(false);
    expect(() => startVisitor(broken)).not.toThrow();
    expect(readVisitor(null)).toBe(false);
  });
});

describe("audienceFor", () => {
  const student = shellSessionFromMe({ id: "u1", displayName: "Öğrenci A", roles: [{ role: "kullanici" }], simAccess: [] });
  const faculty = shellSessionFromMe({ id: "u2", displayName: "Hoca B", roles: [{ role: "ogretim_uyesi" }], simAccess: [] });
  const resident = shellSessionFromMe({ id: "u3", displayName: "Asistan C", roles: [{ role: "uzmanlik_ogrencisi" }], simAccess: [] });
  it("oturum rolüne göre öğrenci/öğretim üyesi; oturumsuzlukta ziyaretçi (üretim ya da işaret)", () => {
    expect(audienceFor({ session: student, visitor: true, dev: true })).toBe("student");
    expect(audienceFor({ session: faculty, visitor: false, dev: false })).toBe("faculty");
    // T219: uzmanlık öğrencisi sim görünümünde öğretim üyesi gibi davranır.
    expect(audienceFor({ session: resident, visitor: false, dev: true })).toBe("faculty");
    expect(audienceFor({ session: null, visitor: true, dev: true })).toBe("visitor");
    expect(audienceFor({ session: null, visitor: false, dev: false })).toBe("visitor");
    // Geliştirmede işaretsiz oturumsuz gezinme bugünkü gibi öğrenci kalır (demo/e2e).
    expect(audienceFor({ session: null, visitor: false, dev: true })).toBe("student");
  });
});

describe("öğretim üyesi görünümü ve öğrenme kilidi muafiyeti (T219)", () => {
  const student = shellSessionFromMe({ id: "u1", displayName: "Öğrenci A", roles: [{ role: "kullanici" }], simAccess: [] });
  const faculty = shellSessionFromMe({ id: "u2", displayName: "Hoca B", roles: [{ role: "ogretim_uyesi" }], simAccess: [] });
  const resident = shellSessionFromMe({ id: "u3", displayName: "Asistan C", roles: [{ role: "uzmanlik_ogrencisi" }], simAccess: [] });
  const admin = shellSessionFromMe({ id: "u4", displayName: "Deniz Yönetici", roles: [{ role: "admin" }], simAccess: [] });

  it("isFacultyLike yalnız öğretim üyesi ve uzmanlık öğrencisinde true döner", () => {
    expect(isFacultyLike(student)).toBe(false);
    expect(isFacultyLike(faculty)).toBe(true);
    expect(isFacultyLike(resident)).toBe(true);
    expect(isFacultyLike(null)).toBe(false);
    expect(isFacultyLike(undefined)).toBe(false);
  });

  it("isLearnUnlocked admin, öğretim üyesi ve uzmanlık öğrencisinde true; öğrenci ve oturumsuzda false", () => {
    expect(isLearnUnlocked(admin)).toBe(true);
    expect(isLearnUnlocked(faculty)).toBe(true);
    expect(isLearnUnlocked(resident)).toBe(true);
    expect(isLearnUnlocked(student)).toBe(false);
    expect(isLearnUnlocked(null)).toBe(false);
    // DEV sahte oturumlar da aynı kuralı izler (T219): admin açık, test öğrencisi kapalı.
    expect(isLearnUnlocked(shellSessionFromDev({ actorId: "dev-admin-0001", role: "admin" }))).toBe(true);
    expect(isLearnUnlocked(shellSessionFromDev({ actorId: "dev-student-0001", role: "student" }))).toBe(false);
  });
});

describe("ShellLayout ziyaretçi göstergesi", () => {
  it("oturumsuz ziyaretçide hesap menüsü yerine rozet ve Öğrenci girişi düğmesi çizilir", () => {
    const html = renderToStaticMarkup(
      createElement(ShellLayout, { children: null, route: resolveRoute(routeHref("simulators")), session: null, visitor: true }),
    );
    expect(html).toContain(`<span class="eg-shell-visitor__badge">${t("shell.visitor.badge")}</span>`);
    expect(html).toContain(t("shell.visitor.signIn"));
    expect(html).not.toContain("eg-shell-account");
  });

  it("öğretim üyesi oturumunda hesap menüsü rol etiketi 'Öğretim üyesi'dir", () => {
    const session = shellSessionFromMe({ id: "u2", displayName: "Hoca B", roles: [{ role: "ogretim_uyesi" }], simAccess: [] });
    const html = renderToStaticMarkup(createElement(ShellLayout, { children: null, route: resolveRoute(routeHref("home")), session }));
    expect(html).toContain(t("shell.account.role.faculty"));
    expect(html).not.toContain("eg-shell-visitor");
  });

  it("uzmanlık öğrencisi oturumunda hesap menüsü rol etiketi 'Uzmanlık öğrencisi'dir (T219)", () => {
    const session = shellSessionFromMe({ id: "u3", displayName: "Asistan C", roles: [{ role: "uzmanlik_ogrencisi" }], simAccess: [] });
    const html = renderToStaticMarkup(createElement(ShellLayout, { children: null, route: resolveRoute(routeHref("home")), session }));
    expect(html).toContain(t("shell.account.role.resident"));
    expect(html).not.toContain(t("shell.account.role.faculty"));
  });
});
