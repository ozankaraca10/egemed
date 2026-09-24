import { useEffect, useRef, type JSX, type ReactNode } from "react";
import { t, type TrKey } from "@egemed/ui/i18n";
import { AdminPage } from "./AdminPage";
import { UsersPage } from "./admin/UsersPage";
import { createSessionStore, sessionWhenEnabled, type DevSession } from "./devAuth";
import { EntryPage } from "./EntryPage";
import { NotFoundPage, pageFor } from "./pages";
import { adminGuardHref, entryHref, isAdminProtected, type ResolvedRoute } from "./routes";
import { ShellLayout } from "./ShellLayout";
import { SimRoute } from "./SimRoute";
import { useHashRoute } from "./useHashRoute";

/**
 * Oturumu tarayıcı `sessionStorage`'ından okur; `devAuth` DOM'suz kalır. Yalnız
 * `import.meta.env.DEV` dalından çağrıldığı için üretim build'inde çağrı, işlev
 * ve `devAuth` bağımlılığı birlikte elenir.
 */
function readDevSession(): DevSession | null {
  return sessionWhenEnabled(import.meta.env.DEV, createSessionStore(window.sessionStorage));
}

/** Rota başlığını sözlük anahtarına çevirir. */
function titleKeyFor(route: ResolvedRoute): TrKey {
  if (route.kind === "page") return route.route.titleKey;
  if (route.kind === "notFound") return "shell.notFound.title";
  return route.titleKey;
}

/** Rota içeriğini seçer; üst bar (`ShellLayout`) tüm iç sayfalarda ortaktır. */
function contentFor(route: ResolvedRoute, session: DevSession | null): ReactNode {
  if (route.kind === "page") return pageFor(route.route.id, session);
  if (route.kind === "admin") return <AdminPage />;
  if (route.kind === "adminUsers") return <UsersPage />;
  if (route.kind === "sim") return <SimRoute simId={route.simId} />;
  return <NotFoundPage />;
}

/**
 * Kabuk kökü: hash rotasını izler, sayfayı yerleştirir, rota değişince odağı
 * `main`e taşır. Yetkisiz `#/admin` isteğinde yönlendirme efekti tamamlanana
 * dek null döner.
 */
export function App(): JSX.Element | null {
  const route = useHashRoute();
  // Doğrudan `import.meta.env.DEV` kullanılır: üretim build'inde `false`a katlanır
  // ve dev oturum kodu (aşağıdaki dizi dâhil) ölü kod olarak elenir.
  const devEnabled = import.meta.env.DEV;
  const session = import.meta.env.DEV ? readDevSession() : null;
  const titleKey = titleKeyFor(route);
  const isFirstRender = useRef(true);
  const guardHref = isAdminProtected(route) ? adminGuardHref(session) : null;
  useEffect(() => {
    document.title = `${t(titleKey)} · ${t("shell.brand")}`;
    // İlk render'da odak taşınmaz; açılışta odak belgede kalır ve kullanıcı
    // "İçeriğe geç" bağlantısına Tab ile ulaşabilir (K1).
    if (!isFirstRender.current) document.getElementById("icerik")?.focus();
    isFirstRender.current = false;
  }, [titleKey]);
  useEffect(() => {
    // Yetkisiz `#/admin` isteği giriş ekranına döner (T35b geçici koruması).
    if (guardHref !== null) window.location.hash = guardHref;
  }, [guardHref]);
  function logout(): void {
    // Dev kapalıyken (üretim) oturum kavramı yoktur; blok ölü koddur ve elenir.
    if (import.meta.env.DEV && session !== null) {
      createSessionStore(window.sessionStorage).clear();
      window.location.hash = entryHref(session.role);
    }
  }
  if (route.kind === "entry") {
    return <EntryPage devEnabled={devEnabled} key={route.role} role={route.role} />;
  }
  if (isAdminProtected(route) && guardHref !== null) return null;
  return (
    <ShellLayout onLogout={logout} route={route} session={session}>
      {contentFor(route, session)}
    </ShellLayout>
  );
}
