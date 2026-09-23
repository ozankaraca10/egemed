import type { TrKey } from "@egemed/ui/i18n";

/** Kabukta tanımlı sayfa kimlikleri. */
export type RouteId = "home" | "simulators" | "tasks" | "notebook";

/** Tek sayfa rotası: hash yolu, gezinme etiketi ve sayfa başlığı anahtarı. */
export interface RouteDef {
  id: RouteId;
  path: `/${string}`;
  labelKey: TrKey;
  titleKey: TrKey;
}

/** Hash çözümlemesi: tanımlı sayfa ya da bulunamadı. */
export type ResolvedRoute = { kind: "page"; route: RouteDef } | { kind: "notFound"; path: string };

export const ROUTES: readonly RouteDef[] = [
  { id: "home", path: "/", labelKey: "shell.nav.home", titleKey: "shell.home.title" },
  { id: "simulators", path: "/simulatorler", labelKey: "shell.nav.simulators", titleKey: "shell.simulators.title" },
  { id: "tasks", path: "/gorevler", labelKey: "shell.nav.tasks", titleKey: "shell.tasks.title" },
  { id: "notebook", path: "/not-defteri", labelKey: "shell.nav.notebook", titleKey: "shell.notebook.title" },
];

/** Simülatör yolları yalnız gösterim içindir; `sims/*` içe aktarılmaz, iframe kurulmaz (ADR-003). */
export const SIM_PATHS: Record<"pulse" | "ausculta" | "opaca", `/sims/${string}/`> = {
  pulse: "/sims/pulse/",
  ausculta: "/sims/ausculta/",
  opaca: "/sims/opaca/",
};

function toPath(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const path = (raw.split("?")[0] ?? "").replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

/** Hash'i saf olarak çözer; DOM'a dokunmaz (bkz. useHashRoute). */
export function resolveRoute(hash: string): ResolvedRoute {
  const path = toPath(hash);
  const route = ROUTES.find((candidate) => candidate.path === path);
  return route === undefined ? { kind: "notFound", path } : { kind: "page", route };
}

/** Rota kimliğinden gezinme bağlantısı üretir. */
export function routeHref(id: RouteId): `#${string}` {
  const route = ROUTES.find((candidate) => candidate.id === id);
  if (route === undefined) throw new Error(`Tanımsız rota kimliği: ${id}`);
  return `#${route.path}`;
}
