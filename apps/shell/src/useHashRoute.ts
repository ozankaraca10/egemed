import { useEffect, useState } from "react";
import { resolveRoute, type ResolvedRoute } from "./routes";

/** Geçerli hash'i izler; DOM'a dokunan tek yönlendirme modülü budur (testler içe aktarmaz). */
export function useHashRoute(): ResolvedRoute {
  const [hash, setHash] = useState<string>(() => window.location.hash);
  useEffect(() => {
    const onChange = (): void => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return resolveRoute(hash);
}
