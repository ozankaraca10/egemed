import { isSimScreenKey, isSimulatorId, type SimScreenKey, type SimulatorId } from "@egemed/sim-host";
import type { TrKey } from "@egemed/ui/i18n";

/** Kabukta tanımlı sayfa kimlikleri. */
export type RouteId = "home" | "simulators" | "about";
export type EntryRole = "admin" | "student";

/** Tek sayfa rotası: hash yolu, gezinme etiketi ve sayfa başlığı anahtarı. */
export interface RouteDef {
  id: RouteId;
  path: `/${string}`;
  labelKey: TrKey;
  titleKey: TrKey;
}

/** Hash çözümlemesi: tanımlı sayfa, giriş, yönetici paneli, sim ya da bulunamadı. */
export type ResolvedRoute =
  | { kind: "page"; route: RouteDef }
  | { kind: "entry"; role: EntryRole; titleKey: TrKey }
  | { kind: "admin"; titleKey: TrKey }
  | { kind: "adminUsers"; titleKey: TrKey }
  | { kind: "adminUserCreate"; titleKey: TrKey }
  | { kind: "adminUserDetail"; userId: string; titleKey: TrKey }
  | { kind: "adminImport"; titleKey: TrKey }
  | { kind: "adminRoles"; titleKey: TrKey }
  | { kind: "adminAudit"; titleKey: TrKey }
  | { kind: "adminRewards"; titleKey: TrKey }
  | {
      kind: "sim";
      simId: SimulatorId;
      titleKey: TrKey;
      challengeId?: string;
      screenKey?: SimScreenKey;
      /** T281a: sim içi düello merkezi ayrıntısı (`/sims/<id>/meydan-okuma/<uuid>`). */
      challengeDetailId?: string;
    }
  /** Eski adreslerin (`/meydan-okuma/<uuid>`) kaynak çözdükten sonra yönlendirdiği ara sayfa. */
  | { kind: "challengeDetail"; challengeId: string; titleKey: TrKey }
  /** T281a: kaldırılan adreslerin hedefe yönlendirilmesi. */
  | { kind: "redirect"; href: `#${string}`; titleKey: TrKey }
  | { kind: "notFound"; path: string };

export const ENTRY_PATHS: Record<EntryRole, `/giris/${string}`> = {
  admin: "/giris/admin",
  student: "/giris/test-ogrenci",
};

/** Yönetici paneli yolu; ana gezinmeye EKLENMEZ, yalnız admin oturumuyla açılır. */
export const ADMIN_PATH = "/admin" as const;

/** Kullanıcılar listesi yolu (T69a, E3 §e.1); admin paneliyle aynı korumayı paylaşır. */
export const ADMIN_USERS_PATH = "/admin/kullanicilar" as const;

/** Kullanıcı ekle alt yolu segmenti (T70, E3 §e.2): `#/admin/kullanicilar/yeni`. */
export const ADMIN_USER_CREATE_SEGMENT = "yeni" as const;

/** Toplu içe aktarma sihirbazı yolu (T71, E3 §e.4/§f). */
export const ADMIN_IMPORT_PATH = "/admin/ice-aktar" as const;

/** Roller ve erişim yolu (T73, E3 §e.6); salt okunur özet + yetki matrisi. */
export const ADMIN_ROLES_PATH = "/admin/roller" as const;

/** Denetim günlüğü yolu (T73, E3 §e.7); salt okunur, filtre + sayfalama. */
export const ADMIN_AUDIT_PATH = "/admin/denetim" as const;

/** Aylık ödüller yolu (T186, 26 Eyl 2026 depo sahibi kararı); sim başına CRUD + kesinleştirme. */
export const ADMIN_REWARDS_PATH = "/admin/oduller" as const;

export const ROUTES: readonly RouteDef[] = [
  { id: "home", path: "/", labelKey: "shell.nav.home", titleKey: "shell.home.title" },
  { id: "simulators", path: "/simulatorler", labelKey: "shell.nav.simulators", titleKey: "shell.simulators.title" },
  // T276b (depo sahibi kararı 1 Eki 2026): üç simin eski Hakkında sayfaları tek sayfada; sim içinden kalktı.
  { id: "about", path: "/hakkinda", labelKey: "shell.nav.about", titleKey: "shell.about.title" },
];

/**
 * ADR-010: düello ayrıntısı ve düello modunda sim açılışı. T281a ile Meydan
 * Okuma ana gezinmeden çıktı; bu yol yalnız eski bağlantıların tanınması ve
 * yönlendirilmesi için korunur.
 */
export const CHALLENGES_PATH = "/meydan-okuma" as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sim içi ekran bağlantısı (ör. `#/sims/opaca/modlar`, `#/sims/opaca/meydan-okuma`). */
export function simScreenHref(simId: SimulatorId, screen: SimScreenKey): `#${string}` {
  return `#/sims/${simId}/${screen}`;
}

/** T281a: düello ayrıntısı simin içindeki merkezde açılır. */
export function challengeHref(simId: SimulatorId, challengeId: string): `#${string}` {
  return `${simScreenHref(simId, "meydan-okuma")}/${challengeId}`;
}

export function challengePlayHref(simId: SimulatorId, challengeId: string): `#${string}` {
  return `#/sims/${simId}/duello/${challengeId}`;
}

/**
 * Simülatör rotaları: kimlik başına hash yolu. `sims/*` paketleri burada içe
 * aktarılmaz, iframe kurulmaz (ADR-003/ADR-006); kart bağlantıları bu yolları
 * kullanır. Ana gezinmeye (`ROUTES`) eklenmez.
 */
export const SIM_PATHS: Record<SimulatorId, `/sims/${SimulatorId}`> = {
  pulse: "/sims/pulse",
  ausculta: "/sims/ausculta",
  opaca: "/sims/opaca",
};

const SIM_PREFIX = "/sims/";

/** Yolun sim kimliğini döndürür; tanınmayan `#/sims/*` yolu için null (→ bulunamadı). */
function simIdForPath(path: string): SimulatorId | null {
  if (!path.startsWith(SIM_PREFIX)) return null;
  const candidate = path.slice(SIM_PREFIX.length);
  return isSimulatorId(candidate) ? candidate : null;
}

/** Sim sayfası başlığı; tek `h1` bu sözlük anahtarından çizilir. */
export function simTitleKey(simId: SimulatorId): TrKey {
  return `sims.${simId}.name`;
}

/** Sim rotası bağlantısı; kartlardaki "Simülatörü aç" buraya gider. */
export function simHref(simId: SimulatorId): `#${string}` {
  return `#${SIM_PATHS[simId]}`;
}

function toPath(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = (raw.split("?")[0] ?? "").replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

/** Hash'i saf olarak çözer; DOM'a dokunmaz (bkz. useHashRoute). */
export function resolveRoute(hash: string): ResolvedRoute {
  const path = toPath(hash);
  if (path === ADMIN_USERS_PATH) return { kind: "adminUsers", titleKey: "admin.users.title" };
  if (path === `${ADMIN_USERS_PATH}/${ADMIN_USER_CREATE_SEGMENT}`) {
    return { kind: "adminUserCreate", titleKey: "admin.users.form.title" };
  }
  if (path.startsWith(`${ADMIN_USERS_PATH}/`)) {
    const userId = path.slice(ADMIN_USERS_PATH.length + 1);
    if (userId.length > 0 && !userId.includes("/")) {
      return { kind: "adminUserDetail", titleKey: "admin.users.detail.routeTitle", userId };
    }
  }
  if (path === ADMIN_IMPORT_PATH) return { kind: "adminImport", titleKey: "admin.import.title" };
  if (path === ADMIN_ROLES_PATH) return { kind: "adminRoles", titleKey: "admin.roles.title" };
  if (path === ADMIN_AUDIT_PATH) return { kind: "adminAudit", titleKey: "admin.audit.title" };
  if (path === ADMIN_REWARDS_PATH) return { kind: "adminRewards", titleKey: "admin.rewards.title" };
  if (path === ADMIN_PATH) return { kind: "admin", titleKey: "admin.title" };
  if (path === ENTRY_PATHS.admin) return { kind: "entry", role: "admin", titleKey: "entry.admin.title" };
  if (path === ENTRY_PATHS.student) return { kind: "entry", role: "student", titleKey: "entry.student.title" };
  // T281a: Meydan Okuma ana gezinmeden çıktı; eski liste adresi Simülatörler'e döner.
  if (path === CHALLENGES_PATH) {
    return { kind: "redirect", href: routeHref("simulators"), titleKey: "shell.simulators.title" };
  }
  if (path.startsWith(`${CHALLENGES_PATH}/`)) {
    const challengeId = path.slice(CHALLENGES_PATH.length + 1);
    if (UUID_PATTERN.test(challengeId)) return { kind: "challengeDetail", challengeId, titleKey: "challenges.detail.title" };
  }
  const duel = /^\/sims\/([a-z]+)\/duello\/([0-9a-f-]{36})$/i.exec(path);
  if (duel !== null && isSimulatorId(duel[1]) && UUID_PATTERN.test(duel[2] ?? "")) {
    return { kind: "sim", simId: duel[1], titleKey: simTitleKey(duel[1]), challengeId: duel[2] ?? "" };
  }
  // Sim içi düello merkezi ayrıntısı; genel ekran kalıbından önce gelir (iki alt segment).
  const simChallenge = /^\/sims\/([a-z]+)\/meydan-okuma\/([0-9a-f-]{36})$/i.exec(path);
  if (simChallenge !== null && isSimulatorId(simChallenge[1]) && UUID_PATTERN.test(simChallenge[2] ?? "")) {
    return {
      kind: "sim",
      simId: simChallenge[1],
      titleKey: simTitleKey(simChallenge[1]),
      screenKey: "meydan-okuma",
      challengeDetailId: simChallenge[2] ?? "",
    };
  }
  const simScreen = /^\/sims\/([a-z]+)\/([^/]+)$/.exec(path);
  if (simScreen !== null && isSimulatorId(simScreen[1]) && isSimScreenKey(simScreen[2])) {
    return { kind: "sim", simId: simScreen[1], titleKey: simTitleKey(simScreen[1]), screenKey: simScreen[2] };
  }
  const simId = simIdForPath(path);
  if (simId !== null) return { kind: "sim", simId, titleKey: simTitleKey(simId) };
  const route = ROUTES.find((candidate) => candidate.path === path);
  return route === undefined ? { kind: "notFound", path } : { kind: "page", route };
}

/** Giriş rolüne göre kendi hash yolunu üretir; ana kabuk gezinme rotalarına eklenmez. */
export function entryHref(role: EntryRole): `#${string}` {
  return `#${ENTRY_PATHS[role]}`;
}

/**
 * `#/admin` koruması: admin oturumu yoksa giriş adresi, varsa null döner.
 * Üretimde oturum kavramı yoktur; bu yüzden `#/admin` her zaman girişe döner.
 */
export function adminGuardHref(session: { role: EntryRole } | null): `#${string}` | null {
  return session?.role === "admin" ? null : entryHref("admin");
}

/** Rota kimliğinden gezinme bağlantısı üretir. */
export function routeHref(id: RouteId): `#${string}` {
  const route = ROUTES.find((candidate) => candidate.id === id);
  if (route === undefined) throw new Error(`Tanımsız rota kimliği: ${id}`);
  return `#${route.path}`;
}

/** Yönetici paneli bağlantısı; yalnız sahte oturum akışında kullanılır. */
export function adminHref(): `#${string}` {
  return `#${ADMIN_PATH}`;
}

/** Kullanıcılar listesi bağlantısı; AdminPage "Kullanıcılar" kartı buraya gider. */
export function adminUsersHref(): `#${string}` {
  return `#${ADMIN_USERS_PATH}`;
}

/** Kullanıcı ayrıntısı/düzenle bağlantısı (T70, E3 §e.3): `#/admin/kullanicilar/:id`. */
export function adminUserDetailHref(userId: string): `#${string}` {
  return `#${ADMIN_USERS_PATH}/${userId}`;
}

/** Kullanıcı ekle bağlantısı (T70, E3 §e.2): `#/admin/kullanicilar/yeni`. */
export function adminUserCreateHref(): `#${string}` {
  return `#${ADMIN_USERS_PATH}/${ADMIN_USER_CREATE_SEGMENT}`;
}

/** Toplu içe aktarma bağlantısı (T71, E3 §e.4); `AdminPage` "Toplu içe aktarma" kartı buraya gider. */
export function adminImportHref(): `#${string}` {
  return `#${ADMIN_IMPORT_PATH}`;
}

/** Roller ve erişim bağlantısı (T73, E3 §e.6); `AdminPage` "Roller ve erişim" kartı buraya gider. */
export function adminRolesHref(): `#${string}` {
  return `#${ADMIN_ROLES_PATH}`;
}

/** Denetim günlüğü bağlantısı (T73, E3 §e.7); `AdminPage` "Denetim günlüğü" kartı buraya gider. */
export function adminAuditHref(): `#${string}` {
  return `#${ADMIN_AUDIT_PATH}`;
}

/** Aylık ödüller bağlantısı (T186); `AdminFrame` "Ödüller" menü öğesi buraya gider. */
export function adminRewardsHref(): `#${string}` {
  return `#${ADMIN_REWARDS_PATH}`;
}

/** Admin oturumu koruması yalnız yönetici rotalarında (panel + kullanıcılar + ekle/ayrıntı + içe aktarma + roller + denetim) uygulanır. */
export function isAdminProtected(route: ResolvedRoute): boolean {
  return (
    route.kind === "admin" ||
    route.kind === "adminUsers" ||
    route.kind === "adminUserCreate" ||
    route.kind === "adminUserDetail" ||
    route.kind === "adminImport" ||
    route.kind === "adminRoles" ||
    route.kind === "adminAudit" ||
    route.kind === "adminRewards"
  );
}

/** Sahte giriş sonrası hedef: yönetici panele, test öğrencisi ana sayfaya gider. */
export function entryRedirectHref(role: EntryRole): `#${string}` {
  return role === "admin" ? adminHref() : routeHref("home");
}
