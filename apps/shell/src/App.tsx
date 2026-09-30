import { ChallengeDetailPage } from "./challenges/ChallengeDetailPage";
import { ToastProvider } from "@egemed/ui";
import { AdminFrame } from "./admin/AdminFrame";
import { useEffect, useMemo, useRef, useState, type JSX, type ReactNode } from "react";
import { t, type TrKey } from "@egemed/ui/i18n";
import { AdminPage } from "./AdminPage";
import { AuditPage } from "./admin/AuditPage";
import { ImportWizardPage } from "./admin/ImportWizardPage";
import { RewardsPage } from "./admin/RewardsPage";
import { RolesPage } from "./admin/RolesPage";
import { UserDetailPage } from "./admin/UserDetailPage";
import { UserFormPage } from "./admin/UserFormPage";
import { UsersPage } from "./admin/UsersPage";
import { apiSessionBaseUrl } from "./apiMode";
import {
  createMockShellDataSources,
  ShellDataSourcesProvider,
  type ShellDataSources,
} from "./dataSources";
import { createSessionStore, sessionWhenEnabled } from "./devAuth";
import { EntryPage } from "./EntryPage";
import { NotFoundPage, pageFor } from "./pages";
import { adminGuardHref, entryHref, isAdminProtected, routeHref, type ResolvedRoute } from "./routes";
import { isLearnUnlocked, sessionAllowsSim, shellSessionFromDev, type ShellSession } from "./session";
import { ShellLayout } from "./ShellLayout";
import { SimRoute } from "./SimRoute";
import type { SimChrome } from "@egemed/sim-host";
import { useHashRoute } from "./useHashRoute";
import { audienceFor, endVisitor, readVisitor, startVisitor, type VisitorStorage } from "./visitor";
import type { SimAudience } from "@egemed/sim-host";

/** Sekme deposu (ziyaretçi işareti); erişim engelliyse null. */
function tabStorage(): VisitorStorage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

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
function contentFor(
  route: ResolvedRoute,
  session: ShellSession | null,
  apiBaseUrl: string | null,
  onChrome?: (chrome: SimChrome | null) => void,
  audience: SimAudience = "student",
  onRequestSignIn?: () => void,
): ReactNode {
  if (route.kind === "page") return pageFor(route.route.id, session);
  // T152: yönetim sayfaları ortak çerçevede (sol menü / dar ekranda sekme şeridi).
  if (route.kind === "admin") return <AdminFrame active="overview"><AdminPage /></AdminFrame>;
  if (route.kind === "adminUsers") return <AdminFrame active="users"><UsersPage currentUserId={session?.actorId ?? null} /></AdminFrame>;
  if (route.kind === "adminUserCreate") return <AdminFrame active="users"><UserFormPage /></AdminFrame>;
  if (route.kind === "adminUserDetail") {
    return <AdminFrame active="users"><UserDetailPage currentUserId={session?.actorId ?? null} userId={route.userId} /></AdminFrame>;
  }
  if (route.kind === "adminImport") return <AdminFrame active="import"><ImportWizardPage /></AdminFrame>;
  if (route.kind === "adminRoles") return <AdminFrame active="roles"><RolesPage /></AdminFrame>;
  if (route.kind === "adminRewards") return <AdminFrame active="rewards"><RewardsPage /></AdminFrame>;
  if (route.kind === "adminAudit") return <AdminFrame active="audit"><AuditPage /></AdminFrame>;
  if (route.kind === "challengeDetail") return <ChallengeDetailPage challengeId={route.challengeId} session={session} />;
  if (route.kind === "sim") {
    return (
      <SimRoute
        {...(route.challengeId === undefined ? {} : { challengeId: route.challengeId })}
        {...(route.screenKey === undefined ? {} : { screenKey: route.screenKey })}
        actorId={session?.actorId}
        allowed={sessionAllowsSim(session, route.simId)}
        apiBaseUrl={apiBaseUrl}
        audience={audience}
        learnUnlocked={isLearnUnlocked(session)}
        onChrome={onChrome}
        onRequestSignIn={onRequestSignIn}
        simId={route.simId}
      />
    );
  }
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
  // Birleşik bar: simin adım/çip/eylemleri (yalnız sim rotasında çizilir).
  const [simChrome, setSimChrome] = useState<SimChrome | null>(null);
  // `apiSessionBaseUrl` üretimde (DEV false) daima null döner; aşağıdaki
  // `import.meta.env.DEV` kapıları sayesinde dinamik içe aktarmalar dâhil API
  // oturum kodu üretim paketine girmez.
  const apiBaseUrl = apiSessionBaseUrl(import.meta.env);
  const apiEnabled = apiBaseUrl !== null;
  const mockSources = useMemo(() => (apiEnabled ? null : createMockShellDataSources()), [apiEnabled]);
  const [apiSources, setApiSources] = useState<ShellDataSources | null>(null);
  const sources = apiEnabled ? apiSources : mockSources;
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
  // Ziyaretçi (26 Eyl 2026): oturum yoksa ve işaret varsa (ya da üretimde) simler sınırlı açılır.
  const visitor = session === null && readVisitor(tabStorage());
  const audience = audienceFor({ session, visitor, dev: import.meta.env.DEV });
  const apiSessionRef = useRef(apiSession);
  apiSessionRef.current = apiSession;
  const routeKey = route.kind === "sim" ? `sim:${route.simId}` : route.kind === "page" ? route.route.id : route.kind;
  const guardHref = !apiPending && isAdminProtected(route) ? adminGuardHref(session) : null;

  useEffect(() => {
    // API kaynakları yalnız geliştirme dalında yüklenir; üretim paketine girmez.
    if (!import.meta.env.DEV || apiBaseUrl === null) return undefined;
    let cancelled = false;
    void import("./apiShellSources")
      .then((module) => {
        if (!cancelled) setApiSources(module.createBrowserShellDataSources(apiBaseUrl));
      })
      .catch(() => {
        if (!cancelled) setApiSources(null);
      });
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

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
    // Oturum açıkken rota değişince `/auth/me` yenilenir; sim erişimi güncellenir.
    if (apiBaseUrl === null || !import.meta.env.DEV || !apiReady || apiSessionRef.current === null) return undefined;
    let cancelled = false;
    void import("./apiAuth")
      .then(async (module) => {
        const auth = module.createShellApiAuth(apiBaseUrl);
        const restored = auth === null ? null : await auth.restore();
        if (!cancelled && restored !== null && apiSessionRef.current !== null) setApiSession(restored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, apiReady, routeKey]);

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

  useEffect(() => {
    // Giriş yapıldığında ziyaretçi işareti temizlenir.
    if (session !== null) endVisitor(tabStorage());
  }, [session]);

  /** Ziyaretçi "Öğrenci girişi"ne basınca: işaret kalkar, öğrenci giriş ekranı açılır. */
  function requestSignIn(): void {
    endVisitor(tabStorage());
    window.location.hash = entryHref("student");
  }

  /** Giriş ekranındaki "Ziyaretçi olarak göz at". */
  function browseAsVisitor(): void {
    startVisitor(tabStorage());
    window.location.hash = routeHref("simulators");
  }

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
  function frame(node: ReactNode): JSX.Element | null {
    if (sources === null) return null;
    // T152: geçici bildirimler (useToast) tüm kabuk sayfalarında kullanılabilir.
    return (
      <ShellDataSourcesProvider sources={sources}>
        <ToastProvider>{node}</ToastProvider>
      </ShellDataSourcesProvider>
    );
  }

  if (route.kind === "entry") {
    return (
      <EntryPage
        apiBaseUrl={apiBaseUrl}
        devEnabled={import.meta.env.DEV}
        key={route.role}
        onApiSignedIn={signedIn}
        onBrowseAsVisitor={browseAsVisitor}
        role={route.role}
      />
    );
  }
  // API oturumunda demo kaynak çizilmeden önce gerçek istemci ve `/auth/me` beklenir.
  if (apiEnabled && (sources === null || !apiReady)) return null;
  if (isAdminProtected(route) && (apiPending || guardHref !== null)) return null;
  return frame(
    <ShellLayout
      onLogout={logout}
      onSignIn={requestSignIn}
      route={route}
      session={session}
      simChrome={route.kind === "sim" ? simChrome : null}
      visitor={audience === "visitor"}
    >
      {contentFor(route, session, apiEnabled && session !== null ? apiBaseUrl : null, setSimChrome, audience, requestSignIn)}
    </ShellLayout>,
  );
}
