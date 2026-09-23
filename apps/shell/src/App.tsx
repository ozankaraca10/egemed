import { useEffect, type JSX } from "react";
import { t, type TrKey } from "@egemed/ui/i18n";
import { NotFoundPage, pageFor } from "./pages";
import { ShellLayout } from "./ShellLayout";
import { useHashRoute } from "./useHashRoute";

/** Kabuk kökü: hash rotasını izler, sayfayı yerleştirir, odağı `main`e taşır. */
export function App(): JSX.Element {
  const route = useHashRoute();
  const titleKey: TrKey = route.kind === "page" ? route.route.titleKey : "shell.notFound.title";
  useEffect(() => {
    document.title = `${t(titleKey)} · ${t("shell.brand")}`;
    document.getElementById("icerik")?.focus();
  }, [titleKey]);
  return (
    <ShellLayout route={route}>
      {route.kind === "page" ? pageFor(route.route.id) : <NotFoundPage />}
    </ShellLayout>
  );
}
