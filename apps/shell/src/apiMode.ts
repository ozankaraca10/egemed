/**
 * T57 — API oturumu yalnız `apiBaseUrl` yapılandırıldığında ve geliştirme
 * modunda açılır (E3 §a dev sağlayıcısı). Yapılandırma yoksa kabuk T35b sahte
 * oturumunda kalır; bu yüzden mevcut e2e akışları değişmez.
 */
export interface ApiEnvLike {
  readonly DEV: boolean;
  readonly VITE_API_BASE_URL?: string | undefined;
}

/**
 * API taban adresi: boş/boşluk değerler yok sayılır, değer kırpılır. Üretim
 * derlemesinde (`DEV` false) daima `null` döner; böylece dev giriş yolu üretim
 * paketine girmez.
 */
export function apiSessionBaseUrl(env: ApiEnvLike): string | null {
  if (env.DEV !== true) return null;
  const raw = env.VITE_API_BASE_URL?.trim();
  return raw === undefined || raw.length === 0 ? null : raw;
}
