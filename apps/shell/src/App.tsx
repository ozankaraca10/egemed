import { useEffect, useRef, type JSX } from "react";
import { t, type TrKey } from "@egemed/ui/i18n";
import { AdminPage } from "./AdminPage";
import { createSessionStore, sessionWhenEnabled, type DevSession } from "./devAuth";
import { EntryPage } from "./EntryPage";
import { NotFoundPage, pageFor } from "./pages";
import { adminGuardHref, entryHref, type ResolvedRoute } from "./routes";
import { ShellLayout } from "./ShellLayout";
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
  const guardHref = route.kind === "admin" ? adminGuardHref(session) : null;
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
  if (route.kind === "admin" && guardHref !== null) return null;
  return (
    <ShellLayout onLogout={logout} route={route} session={session}>
      {route.kind === "page" ? pageFor(route.route.id) : route.kind === "admin" ? <AdminPage /> : <NotFoundPage />}
    </ShellLayout>
  );
}
