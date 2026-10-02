import {
  ApiNetworkError,
  createApiClient,
  isSessionMissingError,
  type ApiClient,
  type ApiFetchInit,
  type ApiResponse,
} from "@egemed/api-client";
import { checkApiDevCredentials } from "./devAuth";
import type { EntryRole } from "./routes";
import { shellSessionFromMe, type ShellSession } from "./session";

/**
 * T57 — API oturumu (E3 §a, T63 uçları). Bu modül yalnız `import.meta.env.DEV`
 * dalından dinamik olarak yüklenir; üretim derlemesinde pakete girmez. Çerez
 * oturumu `credentials: "include"` ile taşınır, mutasyonlar double-submit CSRF
 * başlığı (`X-CSRF-Token`) ile imzalanır. `Date.now()` kullanılmaz.
 */

/** CSRF çerezi `apps/api` oturum çekirdeğiyle aynı addadır (double-submit). */
const CSRF_COOKIE = "egemed_csrf";

interface ApiWindowLike {
  readonly document: { readonly cookie: string };
  fetch(input: string, init: ApiFetchInit): Promise<ApiResponse>;
}

/** Tarayıcı yüzeyini dar arayüzle döndürür; DOM'suz ortamda (test/SSR) `null`. */
export function browserApiWindow(): ApiWindowLike | null {
  const win = (globalThis as { window?: unknown }).window;
  if (typeof win !== "object" || win === null) return null;
  const candidate = win as { document?: { cookie?: unknown }; fetch?: unknown };
  if (typeof candidate.document?.cookie !== "string" || typeof candidate.fetch !== "function") {
    return null;
  }
  return win as unknown as ApiWindowLike;
}

/** `document.cookie` dizgesinden CSRF belirtecini okur; bulunamazsa `null`. */
export function csrfTokenFromCookie(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== CSRF_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    if (value.length === 0) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

/** API oturum akışının kabuk tarafından kullanılan en dar yüzeyi. */
interface ShellApiAuth {
  /** Var olan çerez oturumunu `/auth/me` ile okur; oturum yoksa `null`. */
  restore(): Promise<ShellSession | null>;
  /** Dev sağlayıcısıyla oturum açar; rol sunucudan gelen `/auth/me` rolündendir. */
  signIn(username: string): Promise<ShellSession>;
  /** Sunucu oturumunu iptal eder ve çerezleri siler. */
  signOut(): Promise<void>;
}

/** API istemcisini tarayıcı ortamına bağlar; DOM yoksa `null`. */
export function createShellApiAuth(baseUrl: string): ShellApiAuth | null {
  const resolved = browserApiWindow();
  if (resolved === null) return null;
  const win = resolved;

  function client(): ApiClient {
    return createApiClient({
      baseUrl,
      fetch: (input, init) => win.fetch(input, init),
      readCsrfToken: () => csrfTokenFromCookie(win.document.cookie),
    });
  }

  return {
    async restore(): Promise<ShellSession | null> {
      try {
        return shellSessionFromMe((await client().auth.me()).data);
      } catch (error) {
        // Oturum yokluğu ve ağ kesintisi "oturumsuz" sayılır; sözleşme/sunucu
        // hatası sessizce yutulmaz.
        if (isSessionMissingError(error) || error instanceof ApiNetworkError) return null;
        throw error;
      }
    },
    async signIn(username: string): Promise<ShellSession> {
      return shellSessionFromMe((await client().auth.devLogin({ username })).data);
    },
    async signOut(): Promise<void> {
      await client().auth.logout();
    },
  };
}

interface ApiSubmitHandlers {
  /** Yerel kural veya sunucu reddi: form hata gösterir. */
  onInvalid(): void;
  /** Sunucu oturumu kuruldu; kayıt ve yönlendirme çağıranın işidir. */
  onSignedIn(session: ShellSession): void;
}

/**
 * API modunda giriş: parola ve rol karışması yerel sahte hesap kuralıyla
 * doğrulanır (`checkApiDevCredentials`), oturum `/auth/dev/login` ile kurulur.
 * Sunucu yalnız kullanıcı adı alır; `Date.now()` veya oturum yazımı yoktur.
 */
export async function submitApiEntry(
  values: { readonly username: string; readonly password: string },
  role: EntryRole,
  baseUrl: string,
  handlers: ApiSubmitHandlers,
): Promise<ShellSession | null> {
  const auth = createShellApiAuth(baseUrl);
  if (!checkApiDevCredentials(role, values.username, values.password) || auth === null) {
    handlers.onInvalid();
    return null;
  }
  try {
    const session = await auth.signIn(values.username.trim().toLowerCase());
    handlers.onSignedIn(session);
    return session;
  } catch {
    handlers.onInvalid();
    return null;
  }
}
