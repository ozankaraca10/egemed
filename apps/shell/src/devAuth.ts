import type { EntryRole } from "./routes";

/**
 * Geliştirmeye özel sentetik oturum (T35b). Gerçek kimlik doğrulama değildir;
 * ad, e-posta veya kurum kimliği taşımaz ve K1/T25/T33c gelince kaldırılır.
 */
export interface DevSession {
  role: EntryRole;
  actorId: "dev-admin-0001" | "dev-student-0001";
}

/** Rol başına sentetik aktör kimliği; depodan okunan kaydın doğrulamasında da kullanılır. */
export const DEV_ACTOR_IDS: Record<EntryRole, DevSession["actorId"]> = {
  admin: "dev-admin-0001",
  student: "dev-student-0001",
};

/** Geliştirmeye özel sahte hesaplar; üretim build'inde `isDevAuthEnabled` false döner. */
export const DEV_ACCOUNTS: Record<EntryRole, { username: string; password: string }> = {
  admin: { password: "egemed", username: "admin" },
  student: { password: "egemed", username: "ogrenci" },
};

/** Oturumun tutulduğu tek anahtar. */
export const DEV_SESSION_KEY = "egemed.devSession";

/** `sessionStorage` ile uyumlu en dar depo arayüzü; DOM lib'ine bağımlı değildir. */
export interface DevSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DevSessionStore {
  read(): DevSession | null;
  write(session: DevSession): void;
  clear(): void;
}

/** Bilinmeyen rol veya rolle tutarsız aktör kimliği geçersiz sayılır. */
function isDevSession(value: unknown): value is DevSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { role?: unknown; actorId?: unknown };
  if (candidate.role !== "admin" && candidate.role !== "student") return false;
  return candidate.actorId === DEV_ACTOR_IDS[candidate.role];
}

/** Depoyu sarar; bozuk JSON, bilinmeyen rol ya da tutarsız aktörde `read` null döner. */
export function createSessionStore(storage: DevSessionStorage): DevSessionStore {
  return {
    clear(): void {
      storage.removeItem(DEV_SESSION_KEY);
    },
    read(): DevSession | null {
      const raw = storage.getItem(DEV_SESSION_KEY);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isDevSession(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    write(session: DevSession): void {
      storage.setItem(DEV_SESSION_KEY, JSON.stringify(session));
    },
  };
}

/**
 * Sahte kimliği doğrular: kullanıcı adı trim + küçük harfle, parola birebir
 * karşılaştırılır. Rol karışması (admin kimliği öğrenci formunda) reddedilir.
 */
export function checkDevCredentials(
  role: EntryRole,
  username: string,
  password: string,
): DevSession | null {
  const account = DEV_ACCOUNTS[role];
  if (username.trim().toLowerCase() !== account.username || password !== account.password) return null;
  return { actorId: DEV_ACTOR_IDS[role], role };
}

/** Sahte kimlik doğrulama yalnız `import.meta.env.DEV` true iken açıktır. */
export function isDevAuthEnabled(env: { DEV: boolean }): boolean {
  return env.DEV === true;
}

/**
 * Oturum kararı: dev kapalıyken depo hiç okunmaz, geçerli bir kayıt olsa bile
 * oturum yok sayılır. `App` bunu `import.meta.env.DEV` ile besler ve çağrıyı
 * doğrudan bu sabitle korur; üretim build'inden tümüyle elenir.
 */
export function sessionWhenEnabled(enabled: boolean, store: DevSessionStore): DevSession | null {
  return enabled ? store.read() : null;
}
