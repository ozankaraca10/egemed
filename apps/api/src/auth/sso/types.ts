/**
 * T64 — protokolden bağımsız SSO adaptör sözleşmesi (E3 §a). SSO protokolü
 * (OIDC / SAML 2.0 / CAS) henüz insan kararıdır (§i); çekirdek akış yalnız bu
 * arayüze bağlanır ve hiçbir protokol kütüphanesi kullanılmaz. Protokol
 * seçildiğinde bu arayüzü uygulayan adaptör enjekte edilir; uçlar ve eşleme
 * kuralları değişmez.
 */

/** IdP'nin doğruladığı kimlik; eşleme anahtarı `username` ve/veya `email`dir. */
export interface SsoIdentity {
  /** IdP'nin kalıcı kullanıcı kimliği; ilk girişte `sso_subject`e bağlanır. */
  readonly subject: string;
  /** Kurum kullanıcı adı; kurum içinde büyük/küçük harf duyarsız eşlenir. */
  readonly username?: string | undefined;
  /** E-posta; kurum içinde büyük/küçük harf duyarsız eşlenir. */
  readonly email?: string | undefined;
  /** Yalnız bilgi amaçlıdır; kayıtlı görünen ad bu uçta değiştirilmez. */
  readonly displayName?: string | undefined;
}

export interface SsoProvider {
  /** IdP yetkilendirme adresini üretir; `state`/`nonce` akışa bağlanır. */
  buildAuthorizeUrl(state: string, nonce: string, returnTo: string): string;
  /** Callback parametrelerini doğrular; assertion/token geçersizse `null` döner. */
  exchange(callbackParams: Readonly<Record<string, string>>): Promise<SsoIdentity | null>;
}

/** SSO uçlarının bağlandığı yapılandırma; adaptör yoksa uçlar 404'tür (E3 §a). */
export interface SsoDeps {
  readonly provider: SsoProvider;
  /** state/nonce çerezini imzalayan HMAC anahtarı; yalnız sunucuda tutulur. */
  readonly stateSecret: string;
  readonly stateTtlMs: number;
}
