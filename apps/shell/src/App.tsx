import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { t, type TrKey } from "@egemed/ui/i18n";
import { AdminPage } from "./AdminPage";
import { AuditPage } from "./admin/AuditPage";
import { ImportWizardPage } from "./admin/ImportWizardPage";
import { RolesPage } from "./admin/RolesPage";
import { UserDetailPage } from "./admin/UserDetailPage";
import { UserFormPage } from "./admin/UserFormPage";
import { UsersPage } from "./admin/UsersPage";
import { apiSessionBaseUrl } from "./apiMode";
import { createSessionStore, sessionWhenEnabled } from "./devAuth";
import { EntryPage } from "./EntryPage";
import { NotFoundPage, pageFor } from "./pages";
import { adminGuardHref, entryHref, isAdminProtected, type ResolvedRoute } from "./routes";
import { shellSessionFromDev, type ShellSession } from "./session";
import { ShellLayout } from "./ShellLayout";
import { SimRoute } from "./SimRoute";
import { useHashRoute } from "./useHashRoute";

/**
 * Sahte oturumu tarayıcı `sessionStorage`'ından okur; `devAuth` DOM'suz kalır.
 * Yalnız `import.meta.env.DEV` dalından çağrıldığı için üretim build'inde çağrı
 * ve `devAuth` bağımlılığı birlikte elenir.
 */
function readDevSession(): ShellSession | null {
  const session = sessionWhenEnabled(import.meta.env.DEV, createSessionStore(window.sessionStorage));
  return session === null ? null : shellSessionFromDev(session);
}

/** Rota başlığını sözlük anahtarına çevirir. */
function titleKeyFor(route: ResolvedRoute): TrKey {
  if (route.kind === "page") return route.route.titleKey;
  if (route.kind === "notFound") return "shell.notFound.title";
  return route.titleKey;
}

/** Rota içeriğini seçer; üst bar (`ShellLayout`) tüm iç sayfalarda ortaktır. */
function contentFor(route: ResolvedRoute, session: ShellSession | null): ReactNode {
  if (route.kind === "page") return pageFor(route.route.id, session);
  if (route.kind === "admin") return <AdminPage />;
  if (route.kind === "adminUsers") return <UsersPage />;
  if (route.kind === "adminUserCreate") return <UserFormPage />;
  if (route.kind === "adminUserDetail") return <UserDetailPage currentUserId={session?.actorId ?? null} userId={route.userId} />;
  if (route.kind === "adminImport") return <ImportWizardPage />;
  if (route.kind === "adminRoles") return <RolesPage />;
  if (route.kind === "adminAudit") return <AuditPage />;
  if (route.kind === "sim") return <SimRoute actorId={session?.actorId} simId={route.simId} />;
  return <NotFoundPage />;
}

/**
 * Kabuk kökü: hash rotasını izler, sayfayı yerleştirir, rota değişince odağı
 * `main`e taşır. `apiBaseUrl` yapılandırıldıysa oturum T57 ile `/auth/me`
 * üzerinden geri yüklenir; yapılandırma yoksa T35b sahte oturumu aynen sürer.
 * Yetkisiz `#/admin` isteğinde yönlendirme efekti tamamlanana dek null döner.
 */
export function App(): JSX.Element | null {
  const route = useHashRoute();
  // `apiSessionBaseUrl` üretimde (DEV false) daima null döner; aşağıdaki
  // `import.meta.env.DEV` kapıları sayesinde dinamik içe aktarmalar dâhil API
  // oturum kodu üretim paketine girmez.
  const apiBaseUrl = apiSessionBaseUrl(import.meta.env);
  const apiEnabled = apiBaseUrl !== null;
  const [apiSession, setApiSession] = useState<ShellSession | null>(null);
  const [apiReady, setApiReady] = useState(!apiEnabled);
  const loginApplied = useRef(false);
  const titleKey = titleKeyFor(route);
  const isFirstRender = useRef(true);
  const session: ShellSession | null = apiEnabled
    ? apiSession
    : import.meta.env.DEV
      ? readDevSession()
      : null;
  const apiPending = apiEnabled && !apiReady;
  const guardHref = !apiPending && isAdminProtected(route) ? adminGuardHref(session) : null;

  useEffect(() => {
    // API modunda var olan çerez oturumu bir kez okunur; giriş yapıldıysa
    // geri yükleme sonucu oturumu ezmez.
    if (apiBaseUrl === null || !import.meta.env.DEV) return undefined;
    let cancelled = false;
    void import("./apiAuth")
      .then(async (module) => {
        const auth = module.createShellApiAuth(apiBaseUrl);
        const restored = auth === null ? null : await auth.restore();
        if (!cancelled && !loginApplied.current) {
          setApiSession(restored);
          setApiReady(true);
        }
      })
      .catch(() => {
        if (!cancelled && !loginApplied.current) {
          setApiSession(null);
          setApiReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    document.title = `${t(titleKey)} · ${t("shell.brand")}`;
    // İlk render'da odak taşınmaz; açılışta odak belgede kalır ve kullanıcı
    // "İçeriğe geç" bağlantısına Tab ile ulaşabilir (K1).
    if (!isFirstRender.current) document.getElementById("icerik")?.focus();
    isFirstRender.current = false;
  }, [titleKey]);
  useEffect(() => {
    // Yetkisiz `#/admin` isteği giriş ekranına döner (T35b geçici koruması);
    // API modunda karar `/auth/me` rolünden gelir ve yanıt gelene dek beklenir.
    if (guardHref !== null) window.location.hash = guardHref;
  }, [guardHref]);

  function signedIn(next: ShellSession): void {
    loginApplied.current = true;
    setApiSession(next);
    setApiReady(true);
  }

  function logout(): void {
    if (import.meta.env.DEV && apiEnabled && apiBaseUrl !== null) {
      const role = apiSession?.role ?? "student";
      const baseUrl = apiBaseUrl;
      void (async () => {
        try {
          const module = await import("./apiAuth");
          const auth = module.createShellApiAuth(baseUrl);
          if (auth !== null) await auth.signOut();
        } catch {
          // Çıkış isteği başarısız olsa da yerel gösterge kapanır; sunucu
          // oturumu HttpOnly çerezle taşınır ve istemciden silinemez.
        }
        setApiSession(null);
        window.location.hash = entryHref(role);
      })();
      return;
    }
    // Dev kapalıyken (üretim) oturum kavramı yoktur; blok ölü koddur ve elenir.
    if (import.meta.env.DEV && session !== null) {
      createSessionStore(window.sessionStorage).clear();
      window.location.hash = entryHref(session.role);
    }
  }
  if (route.kind === "entry") {
    return (
      <EntryPage
        apiBaseUrl={apiBaseUrl}
        devEnabled={import.meta.env.DEV}
        key={route.role}
        onApiSignedIn={signedIn}
        role={route.role}
      />
    );
  }
  if (isAdminProtected(route) && (apiPending || guardHref !== null)) return null;
  return (
    <ShellLayout onLogout={logout} route={route} session={session}>
      {contentFor(route, session)}
    </ShellLayout>
  );
}
