import type { EntryRole } from "./routes";
import type { SimId } from "./SimCard";

/**
 * T57 — kabuk oturumunun ortak görünümü. Sahte oturum (T35b) ve API oturumu
 * (`/auth/me`) aynı arayüzü taşır; `displayName` yalnız API oturumunda doludur,
 * sahte oturumda `null` kalır ve arayüz sentetik etiketi gösterir.
 * `simAccess` yalnız API oturumunda doludur; sahte oturumda `null` (sınırsız).
 */
export interface ShellSession {
  readonly role: EntryRole;
  readonly actorId: string;
  readonly displayName: string | null;
  readonly simAccess: readonly SimId[] | null;
  /** Öğretim üyesi rolü (T171): simleri tam kullanır, oyunlaştırmaya katılmaz. Sahte oturumda yok. */
  readonly faculty?: boolean;
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
  return { actorId: session.actorId, displayName: null, role: session.role, simAccess: null };
}

/** Sahte oturum ve oturumsuz gezinme sınırsızdır; API oturumu listeye bakar. */
export function sessionAllowsSim(session: ShellSession | null, simId: SimId): boolean {
  if (session === null || session.simAccess === null) return true;
  return session.simAccess.includes(simId);
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
  readonly simAccess: readonly SimId[];
}): ShellSession {
  return {
    actorId: me.id,
    displayName: me.displayName,
    role: shellRoleFromApiRoles(me.roles),
    simAccess: [...me.simAccess],
    faculty: me.roles.some((entry) => entry.role === "ogretim_uyesi"),
  };
}
