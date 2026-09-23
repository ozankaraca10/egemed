import { useEffect, useRef, type JSX } from "react";
import { t, type TrKey } from "@egemed/ui/i18n";
import { NotFoundPage, pageFor } from "./pages";
import { ShellLayout } from "./ShellLayout";
import { useHashRoute } from "./useHashRoute";

/** Kabuk kökü: hash rotasını izler, sayfayı yerleştirir, rota değişince odağı `main`e taşır. */
export function App(): JSX.Element {
  const route = useHashRoute();
  const titleKey: TrKey = route.kind === "page" ? route.route.titleKey : "shell.notFound.title";
  const isFirstRender = useRef(true);
  useEffect(() => {
    document.title = `${t(titleKey)} · ${t("shell.brand")}`;
    // İlk render'da odak taşınmaz; açılışta odak belgede kalır ve kullanıcı
    // "İçeriğe geç" bağlantısına Tab ile ulaşabilir (K1).
    if (!isFirstRender.current) document.getElementById("icerik")?.focus();
    isFirstRender.current = false;
  }, [titleKey]);
  return (
    <ShellLayout route={route}>
      {route.kind === "page" ? pageFor(route.route.id) : <NotFoundPage />}
    </ShellLayout>
  );
}
