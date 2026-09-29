import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Dialog } from "../../packages/ui/src/primitives/Dialog";
import { t } from "../../packages/ui/i18n/tr";
import {
  ADMIN_REWARDS_PATH,
  adminRewardsHref,
  isAdminProtected,
  resolveRoute,
} from "../../apps/shell/src/routes";
import { createMockRewardsSource, hasRewardFormErrors, initialRewardFormValues, monthLabelTr, nextMonthKey, rewardFormValuesFrom, toRewardUpsertRequest, validateRewardForm, type AdminReward, type RewardFormValues } from "../../apps/shell/src/admin/rewardsDataSource";
import { RewardFormDialog, RewardsView, type RewardsViewProps } from "../../apps/shell/src/admin/RewardsPage";

/** React eleman ağacını DOM'suz gezer (UsersPage.tsx test deseni). */
function collectElements(
  node: unknown,
  predicate: (element: ReactElement) => boolean,
  results: ReactElement[] = [],
): ReactElement[] {
  if (node === null || node === undefined || typeof node !== "object") return results;
  if (Array.isArray(node)) {
    for (const child of node) collectElements(child, predicate, results);
    return results;
  }
  const element = node as ReactElement;
  if (element.type === undefined) return results;
  if (predicate(element)) results.push(element);
  const children = (element.props as { children?: unknown } | undefined)?.children;
  if (typeof children === "function") {
    collectElements((children as (control: unknown) => unknown)({}), predicate, results);
  } else if (children !== undefined) {
    collectElements(children, predicate, results);
  }
  return results;
}

interface DialogLikeProps {
  readonly title: unknown;
  readonly open: boolean;
  readonly footer?: unknown;
  readonly children?: unknown;
}

function dialogPropsOf(tree: ReactElement): DialogLikeProps {
  const [dialogElement] = collectElements(tree, (element) => element.type === Dialog);
  if (dialogElement === undefined) throw new Error("Dialog öğesi bulunamadı");
  return dialogElement.props as DialogLikeProps;
}

function noop(): void {
  // yalnız zorunlu prop'u doldurur; ilgisiz durumlarda çağrılmaz
}

const OPACA_CURRENT: AdminReward = {
  description: "Açıklama",
  eligibility: { cohorts: [1, 2, 3, 4, 5, 6], minAssessments: 4, requirePublicName: true },
  finalizedAt: null,
  month: "2026-09",
  simId: "opaca",
  sponsor: "Radyoloji Anabilim Dalı",
  terms: ["Madde 1"],
  title: "Gözlemci katılımı",
  updatedAt: "2026-09-27T09:00:00.000+03:00",
  winners: [],
  winnersCount: 3,
};

const OPACA_FINALIZED: AdminReward = {
  ...OPACA_CURRENT,
  finalizedAt: "2026-09-01T06:00:00.000+03:00",
  month: "2026-08",
  winners: [
    { displayName: "Mert Tunç", isMe: false, month: "2026-08", rank: 1, score: 92.7 },
    { displayName: "Deniz Kaya", isMe: false, month: "2026-08", rank: 2, score: 90.1 },
  ],
};

describe("routes.ts — #/admin/oduller (T186)", () => {
  it("resolveRoute doğru başlık anahtarıyla eşler; adminRewardsHref beklenen hash'i döner; koruma altındadır", () => {
    expect(resolveRoute(`#${ADMIN_REWARDS_PATH}`)).toEqual({ kind: "adminRewards", titleKey: "admin.rewards.title" });
    expect(adminRewardsHref()).toBe(`#${ADMIN_REWARDS_PATH}`);
    expect(isAdminProtected({ kind: "adminRewards", titleKey: "admin.rewards.title" })).toBe(true);
  });
});

describe("rewardsDataSource — saf yardımcılar", () => {
  it("monthLabelTr ay anahtarını Türkçe ay adı + yıla çevirir", () => {
    expect(monthLabelTr("2026-09")).toBe("Eylül 2026");
    expect(monthLabelTr("2026-01")).toBe("Ocak 2026");
    expect(monthLabelTr("2026-12")).toBe("Aralık 2026");
  });

  it("nextMonthKey aralık→ocak yıl geçişini doğru yapar", () => {
    expect(nextMonthKey("2026-09")).toBe("2026-10");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });

  it("rewardFormValuesFrom → toRewardUpsertRequest gidiş-dönüşte içerik korunur", () => {
    const values = rewardFormValuesFrom(OPACA_CURRENT);
    const request = toRewardUpsertRequest(values);
    expect(request).toEqual({
      description: OPACA_CURRENT.description,
      eligibility: OPACA_CURRENT.eligibility,
      sponsor: OPACA_CURRENT.sponsor,
      terms: OPACA_CURRENT.terms,
      title: OPACA_CURRENT.title,
      winnersCount: OPACA_CURRENT.winnersCount,
    });
  });
});

describe("rewardsDataSource — validateRewardForm (sözleşme sınırları)", () => {
  const valid: RewardFormValues = initialRewardFormValues("2026-10");

  it("geçerli değerlerde hata üretmez", () => {
    const values: RewardFormValues = { ...valid, sponsor: "Sponsor", title: "Başlık", description: "Açıklama" };
    expect(hasRewardFormErrors(validateRewardForm(values))).toBe(false);
  });

  it("ay biçimi, başlık/açıklama/sponsor uzunluğu, kazanan sayısı ve dönem sınırlarını denetler", () => {
    expect(validateRewardForm({ ...valid, month: "2026-13" }).month).toBe("monthInvalid");
    expect(validateRewardForm({ ...valid, title: "" }).title).toBe("titleInvalid");
    expect(validateRewardForm({ ...valid, title: "x".repeat(161) }).title).toBe("titleInvalid");
    expect(validateRewardForm({ ...valid, description: "" }).description).toBe("descriptionInvalid");
    expect(validateRewardForm({ ...valid, sponsor: "" }).sponsor).toBe("sponsorInvalid");
    expect(validateRewardForm({ ...valid, winnersCount: "0" }).winnersCount).toBe("winnersCountInvalid");
    expect(validateRewardForm({ ...valid, winnersCount: "11" }).winnersCount).toBe("winnersCountInvalid");
    expect(validateRewardForm({ ...valid, cohorts: [] }).cohorts).toBe("cohortsRequired");
    expect(validateRewardForm({ ...valid, cohorts: [1, 1] }).cohorts).toBe("cohortsRequired");
    expect(validateRewardForm({ ...valid, minAssessments: "101" }).minAssessments).toBe("minAssessmentsInvalid");
    expect(validateRewardForm({ ...valid, termsText: Array.from({ length: 21 }, (_, i) => `madde ${i}`).join("\n") }).terms).toBe("termsInvalid");
    expect(validateRewardForm({ ...valid, termsText: "x".repeat(301) }).terms).toBe("termsInvalid");
  });
});

describe("createMockRewardsSource — CRUD + kesinleştirme (T186)", () => {
  it("list Opaca için tohumlu Eylül (bu ay) + Ağustos (kesinleşmiş) döner, en yeni ay önce", async () => {
    const source = createMockRewardsSource();
    const rewards = await source.list("opaca");
    expect(rewards.map((r) => r.month)).toEqual(["2026-09", "2026-08"]);
    expect(rewards[0]?.finalizedAt).toBeNull();
    expect(rewards[1]?.finalizedAt).not.toBeNull();
    expect(rewards[1]?.winners.length).toBe(3);
  });

  it("finalize: ay kapanmadan month_not_closed, ikinci çağrıda already_finalized, başarılı akışta finalizedAt dolar", async () => {
    const source = createMockRewardsSource();
    await expect(source.finalize("opaca", "2026-09", "2026-09")).rejects.toThrow("month_not_closed");
    const body = toRewardUpsertRequest(initialRewardFormValues("2026-08"));
    await source.remove("pulse", "2026-08").catch(() => undefined);
    await source.upsert("pulse", "2026-08", body);
    const finalized = await source.finalize("pulse", "2026-08", "2026-09");
    expect(finalized.finalizedAt).not.toBeNull();
    await expect(source.finalize("pulse", "2026-08", "2026-09")).rejects.toThrow("already_finalized");
  });
});

describe("RewardsPage.tsx — diyalog bileşenleri (DOM'suz statik render)", () => {

  it("RewardFormDialog alan hatalarını gösterir", () => {
    const tree = RewardFormDialog({
      errors: { cohorts: "cohortsRequired", title: "titleInvalid" },
      mode: "create",
      onClose: noop,
      onSubmit: noop,
      onValuesChange: noop,
      open: true,
      submitErrorKey: null,
      submitting: false,
      values: initialRewardFormValues("2026-10"),
    }) as ReactElement;
    const props = dialogPropsOf(tree);
    const html = renderToStaticMarkup(createElement("div", null, props.children as ReactElement));
    expect(html).toContain(t("admin.rewards.form.error.titleInvalid"));
    expect(html).toContain(t("admin.rewards.form.error.cohortsRequired"));
  });
});

describe("RewardsView — durumsuz görünüm (DOM'suz statik render)", () => {
  function baseProps(overrides: Partial<RewardsViewProps> = {}): RewardsViewProps {
    return {
      currentMonthKey: "2026-09",
      deleteDialog: {
        bodyKey: "admin.rewards.delete.body",
        busy: false,
        cancelKey: "admin.rewards.delete.cancel",
        confirmKey: "admin.rewards.delete.confirm",
        errorKey: null,
        onCancel: noop,
        onConfirm: noop,
        open: false,
        titleKey: "admin.rewards.delete.title",
      },
      finalizeDialog: {
        bodyKey: "admin.rewards.finalize.body",
        busy: false,
        cancelKey: "admin.rewards.finalize.cancel",
        confirmKey: "admin.rewards.finalize.confirm",
        errorKey: null,
        onCancel: noop,
        onConfirm: noop,
        open: false,
        titleKey: "admin.rewards.finalize.title",
      },
      form: {
        errors: {},
        mode: "create",
        onClose: noop,
        onSubmit: noop,
        onValuesChange: noop,
        open: false,
        submitErrorKey: null,
        submitting: false,
        values: initialRewardFormValues("2026-10"),
      },
      onCreate: noop,
      onDeleteRequest: noop,
      onEdit: noop,
      onFinalizeRequest: noop,
      onRetry: noop,
      onSimChange: noop,
      rewards: [OPACA_CURRENT, OPACA_FINALIZED],
      simId: "opaca",
      status: "ready",
      ...overrides,
    };
  }

  it("bu ay geçerli ödülde düzenle/sil var, kesinleştir yok; kesinleşmiş ödülde hiçbiri yok, kazananlar listelenir", () => {
    const html = renderToStaticMarkup(createElement(RewardsView, baseProps()));
    expect(html).toContain(t("admin.rewards.status.current"));
    expect(html).toContain(t("admin.rewards.status.finalized"));
    expect(html).toContain("1. Mert Tunç, 2. Deniz Kaya");
    expect(html).toContain(t("admin.rewards.action.edit"));
    expect(html).toContain(t("admin.rewards.action.delete"));
  });

  it("geçmiş, kesinleşmemiş ay için kesinleştir eylemi görünür", () => {
    const draftPast: AdminReward = { ...OPACA_CURRENT, finalizedAt: null, month: "2026-08" };
    const html = renderToStaticMarkup(createElement(RewardsView, baseProps({ rewards: [draftPast] })));
    expect(html).toContain(t("admin.rewards.action.finalize"));
  });

  it("boş listede EmptyState metni görünür; hata durumunda yeniden dene görünür", () => {
    const emptyHtml = renderToStaticMarkup(createElement(RewardsView, baseProps({ rewards: [] })));
    expect(emptyHtml).toContain(t("admin.rewards.empty"));
    const errorHtml = renderToStaticMarkup(createElement(RewardsView, baseProps({ rewards: null, status: "error" })));
    expect(errorHtml).toContain(t("admin.rewards.error.title"));
    expect(errorHtml).toContain(t("admin.rewards.error.retry"));
  });
});
