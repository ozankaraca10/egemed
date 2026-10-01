import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage, SimulatorsPage } from "../../apps/shell/src/pages";
import {
  LeaderboardVisibilityControl,
  commitLeaderboardVisibility,
} from "../../apps/shell/src/home/ProgressSection";
import { routeHref, simHref } from "../../apps/shell/src/routes";
import { sessionAllowsSim, shellSessionFromDev, shellSessionFromMe } from "../../apps/shell/src/session";
import { SimCard } from "../../apps/shell/src/SimCard";
import { SimRoute } from "../../apps/shell/src/SimRoute";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it } from "vitest";

const API_SESSION = shellSessionFromMe({
  displayName: "Ada",
  id: "00000000-0000-4000-8000-000000000001",
  roles: [{ role: "kullanici" }],
  simAccess: ["ausculta", "opaca"],
});

describe("oturum sim erişimi", () => {
  it("sahte oturum sınırsızdır; API oturumu /auth/me listesini kopyalar", () => {
    const dev = shellSessionFromDev({ actorId: "dev-student-0001", role: "student" });
    expect(dev.simAccess).toBeNull();
    expect(sessionAllowsSim(dev, "pulse")).toBe(true);
    expect(sessionAllowsSim(null, "pulse")).toBe(true);
    expect(API_SESSION.simAccess).toEqual(["ausculta", "opaca"]);
    expect(sessionAllowsSim(API_SESSION, "pulse")).toBe(false);
    expect(sessionAllowsSim(API_SESSION, "ausculta")).toBe(true);
  });
});

describe("sim kartı ve rotası erişim kapısı", () => {
  it("erişimi olmayan sim işaretlenir; bağlantı durur", () => {
    const html = renderToStaticMarkup(
      createElement(SimCard, { denied: true, href: simHref("pulse"), id: "pulse" }),
    );
    expect(html).toContain(t("sims.access.none"));
    expect(html).toContain(`href="${simHref("pulse")}"`);
    expect(html).toContain(t("sims.open"));
  });

  it("ana sayfa ve simülatörler API oturumunda kapalı simi işaretler", () => {
    for (const html of [
      renderToStaticMarkup(createElement(HomePage, { session: API_SESSION })),
      renderToStaticMarkup(createElement(SimulatorsPage, { session: API_SESSION })),
    ]) {
      expect(html).toContain(t("sims.access.none"));
      expect(html).toContain(`href="${simHref("pulse")}"`);
    }
  });

  it("sahte oturum kartında erişim yok yazısı yoktur", () => {
    const html = renderToStaticMarkup(
      createElement(HomePage, { session: shellSessionFromDev({ actorId: "dev-student-0001", role: "student" }) }),
    );
    expect(html).not.toContain(t("sims.access.none"));
    expect(html).not.toContain(t("home.progress.leaderboardVisible"));
  });

  it("erişim yokken sim modülü host'u çizilmez", () => {
    const html = renderToStaticMarkup(createElement(SimRoute, { allowed: false, simId: "pulse" }));
    expect(html).toContain(t("sims.access.denied"));
    expect(html).toContain(`href="${routeHref("simulators")}"`);
    expect(html).toContain(t("sims.back"));
    expect(html).not.toContain("eg-shell-sim-page__host");
  });
});

describe("liderlik görünürlüğü", () => {
  it("anahtar ve açıklama çizilir", () => {
    const html = renderToStaticMarkup(
      createElement(LeaderboardVisibilityControl, {
        error: false,
        onToggle: () => undefined,
        pending: false,
        visible: true,
      }),
    );
    expect(html).toContain('role="switch"');
    expect(html).toContain(t("home.progress.leaderboardVisible"));
    expect(html).toContain(t("home.progress.leaderboardVisible.hint"));
    expect(html).toContain('checked=""');
  });

  // T295: anonim izleyene satır yerine bilgi notu; tercih anahtarı yanında görünür.
  it("kapalıyken sıralamada görünmediğini söyleyen bilgi notu çizilir", () => {
    const html = renderToStaticMarkup(
      createElement(LeaderboardVisibilityControl, {
        error: false,
        onToggle: () => undefined,
        pending: false,
        visible: false,
      }),
    );
    expect(html).toContain(t("home.progress.leaderboardVisible.hiddenNote"));
    expect(html).not.toContain(t("home.progress.leaderboardVisible.hint"));
  });

  it("kayıt hatasında önceki durum geri gelir", async () => {
    const failed = await commitLeaderboardVisibility(true, false, () => Promise.reject(new Error("fail")));
    expect(failed).toEqual({ failed: true, visible: true });
    const saved = await commitLeaderboardVisibility(true, false, () => Promise.resolve(false));
    expect(saved).toEqual({ failed: false, visible: false });
  });

  // T145: tercih yüklenirken (ilk yükleme ya da yenileme) anahtar devre dışı
  // + aria-busy olur; tıklama yükleme bitmeden kaybolmaz/geri yazılmaz.
  it("yükleme sürerken (pending) anahtar devre dışı ve aria-busy olur", () => {
    const html = renderToStaticMarkup(
      createElement(LeaderboardVisibilityControl, {
        error: false,
        onToggle: () => undefined,
        pending: true,
        visible: false,
      }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled=\"\"");
  });

  it("yükleme bitince anahtar etkinleşir; aria-busy kalkar", () => {
    const html = renderToStaticMarkup(
      createElement(LeaderboardVisibilityControl, {
        error: false,
        onToggle: () => undefined,
        pending: false,
        visible: true,
      }),
    );
    expect(html).toContain('aria-busy="false"');
    expect(html).not.toContain("disabled=\"\"");
  });
});
