/** Oyunlaştırma özellik bayrağı — platform props + isteğe bağlı sorgu (dev demo). */

import { searchParam } from "../platform-dom";
import type { DemoKind } from "./demo";

export function gamiEnabledFrom(search: string, envFlag: string | undefined, propEnabled = true): boolean {
  if (propEnabled === false) return false;
  const q = searchParam(search, "gami");
  if (q === "0") return false;
  if (envFlag === "1" || q === "1") return true;
  return propEnabled;
}

export function gamiDemoFrom(search: string, devBuild = false): DemoKind | null {
  if (!devBuild) return null;
  const v = searchParam(search, "demo");
  return v === "full" || v === "empty" || v === "winner" ? v : null;
}
