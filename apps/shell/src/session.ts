import type { EntryRole } from "./routes";

/**
 * T57 — kabuk oturumunun ortak görünümü. Sahte oturum (T35b) ve API oturumu
 * (`/auth/me`) aynı arayüzü taşır; `displayName` yalnız API oturumunda doludur,
 * sahte oturumda `null` kalır ve arayüz sentetik etiketi gösterir.
 */
export interface ShellSession {
  readonly role: EntryRole;
  readonly actorId: string;
  readonly displayName: string | null;
}

/** Sahte depodan okunan oturumun en dar yüzeyi (`devAuth.DevSession` yapısal olarak uyar). */
export interface DevSessionLike {
  readonly role: EntryRole;
  readonly actorId: string;
}

/** `/auth/me` rol listesinin en dar yüzeyi; sözleşme şeması `{ role }` nesneleri döner. */
export interface ApiRoleLike {
  readonly role: string;
}

/** Sahte oturumu kabuk görünümüne çevirir; sentetik olduğu `displayName: null` ile bellidir. */
export function shellSessionFromDev(session: DevSessionLike): ShellSession {
  return { actorId: session.actorId, displayName: null, role: session.role };
}

/**
 * Sunucudaki rol listesinden kabuk rolünü seçer (E3 §b): `admin` rolü varsa
 * yönetici, yoksa öğrenci. Yetki kararı her zaman `/auth/me` yanıtına dayanır.
 */
export function shellRoleFromApiRoles(roles: readonly ApiRoleLike[]): EntryRole {
  return roles.some((entry) => entry.role === "admin") ? "admin" : "student";
}

/**
 * `/auth/me` verisini kabuk oturumuna çevirir. Kimlik ve görünen ad sunucudan
 * gelir; istemci tarafında üretilmez (T63 sözleşmesi).
 */
export function shellSessionFromMe(me: {
  readonly id: string;
  readonly displayName: string;
  readonly roles: readonly ApiRoleLike[];
}): ShellSession {
  return {
    actorId: me.id,
    displayName: me.displayName,
    role: shellRoleFromApiRoles(me.roles),
  };
}
