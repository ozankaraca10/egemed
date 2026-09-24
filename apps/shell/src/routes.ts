import { isSimulatorId, type SimulatorId } from "@egemed/sim-host";
import type { TrKey } from "@egemed/ui/i18n";

/** Kabukta tanımlı sayfa kimlikleri. */
export type RouteId = "home" | "simulators" | "tasks" | "notebook";
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
  | { kind: "sim"; simId: SimulatorId; titleKey: TrKey }
  | { kind: "notFound"; path: string };

export const ENTRY_PATHS: Record<EntryRole, `/giris/${string}`> = {
  admin: "/giris/admin",
  student: "/giris/test-ogrenci",
};

/** Yönetici paneli yolu; ana gezinmeye EKLENMEZ, yalnız admin oturumuyla açılır. */
export const ADMIN_PATH = "/admin" as const;

export const ROUTES: readonly RouteDef[] = [
  { id: "home", path: "/", labelKey: "shell.nav.home", titleKey: "shell.home.title" },
  { id: "simulators", path: "/simulatorler", labelKey: "shell.nav.simulators", titleKey: "shell.simulators.title" },
  { id: "tasks", path: "/gorevler", labelKey: "shell.nav.tasks", titleKey: "shell.tasks.title" },
  { id: "notebook", path: "/not-defteri", labelKey: "shell.nav.notebook", titleKey: "shell.notebook.title" },
];

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
  if (path === ADMIN_PATH) return { kind: "admin", titleKey: "admin.title" };
  if (path === ENTRY_PATHS.admin) return { kind: "entry", role: "admin", titleKey: "entry.admin.title" };
  if (path === ENTRY_PATHS.student) return { kind: "entry", role: "student", titleKey: "entry.student.title" };
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

/** Sahte giriş sonrası hedef: yönetici panele, test öğrencisi ana sayfaya gider. */
export function entryRedirectHref(role: EntryRole): `#${string}` {
  return role === "admin" ? adminHref() : routeHref("home");
}
