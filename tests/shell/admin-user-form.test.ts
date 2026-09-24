import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { isAdminProtected, resolveRoute } from "../../apps/shell/src/routes";
import {
  hasFormErrors,
  INITIAL_CREATE_USER_VALUES,
  isFormDirty,
  normalizeMappingKeyValue,
  toggleSimAccess,
  validateCreateUserForm,
  type CreateUserFormValues,
} from "../../apps/shell/src/admin/userForm";
import {
  applyUserPatch,
  buildCreatedUserDetail,
  createMockUsersSource,
  generateSyntheticUsers,
  type AdminUserDetail,
  type CreateUserInput,
} from "../../apps/shell/src/admin/usersDataSource";
import { UserFormView, type UserFormViewProps } from "../../apps/shell/src/admin/UserFormPage";
import { UserDetailView, type UserDetailViewProps } from "../../apps/shell/src/admin/UserDetailPage";
import { t } from "../../packages/ui/i18n/tr";

const BASE_VALUES: CreateUserFormValues = {
  authMethod: "sso",
  displayName: "Örnek Öğrenci",
  mappingKeyType: "username",
  mappingKeyValue: "ornek.ogrenci",
  simAccess: ["pulse"],
  unitId: "unit-3",
};

function render(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

function noop(): void {
  // yalnız zorunlu prop'u doldurur; ilgisiz durumlarda çağrılmaz
}

function baseFormViewProps(overrides: Partial<UserFormViewProps>): UserFormViewProps {
  return {
    confirmDiscard: false,
    errors: {},
    onAuthMethodChange: noop,
    onBackToForm: noop,
    onConfirm: noop,
    onDisplayNameChange: noop,
    onMappingTypeChange: noop,
    onMappingValueChange: noop,
    onRequestClose: noop,
    onSimAccessToggle: noop,
    onSubmitRequest: noop,
    onUnitChange: noop,
    step: "form",
    submitError: false,
    submitting: false,
    values: BASE_VALUES,
    ...overrides,
  };
}

const DETAIL_ACTIVE: AdminUserDetail = {
  authMethod: "sso",
  createdAt: "2026-01-10T09:00:00.000+03:00",
  displayName: "Örnek Kullanıcı 001",
  email: null,
  gamification: [{ level: 4, simId: "pulse", streakCurrent: 3, xp: 1450 }],
  history: [{ action: "user.create", id: "user-001-hist-1", occurredAt: "2026-01-10T09:00:00.000+03:00" }],
  id: "user-001",
  lastLoginAt: "2026-02-05T09:00:00.000+03:00",
  role: "kullanici",
  roles: ["kullanici"],
  simAccess: ["pulse"],
  status: "active",
  unitId: "unit-3",
  username: "ornek.kullanici.001",
};

describe("userForm.ts saf doğrulama (E3 §c/§f)", () => {
  it("eşleme anahtarı boşsa mappingValueRequired döner", () => {
    const errors = validateCreateUserForm({ ...BASE_VALUES, mappingKeyValue: "   " });
    expect(errors.mappingKeyValue).toBe("mappingValueRequired");
  });

  it("kullanıcı adı deseni ihlal edilirse usernameInvalid; geçerliyse hatasız", () => {
    expect(validateCreateUserForm({ ...BASE_VALUES, mappingKeyValue: "AB" }).mappingKeyValue).toBe("usernameInvalid");
    expect(validateCreateUserForm({ ...BASE_VALUES, mappingKeyValue: "-baslangic" }).mappingKeyValue).toBe(
      "usernameInvalid",
    );
    expect(validateCreateUserForm({ ...BASE_VALUES, mappingKeyValue: "ornek.ogrenci" }).mappingKeyValue).toBeUndefined();
  });

  it("e-posta biçimi geçersizse emailInvalid; geçerliyse hatasız (normalize edilmiş)", () => {
    const invalid = validateCreateUserForm({ ...BASE_VALUES, mappingKeyType: "email", mappingKeyValue: "gecersiz" });
    expect(invalid.mappingKeyValue).toBe("emailInvalid");
    const valid = validateCreateUserForm({
      ...BASE_VALUES,
      mappingKeyType: "email",
      mappingKeyValue: "  ORNEK@OGRENCI.INVALID  ",
    });
    expect(valid.mappingKeyValue).toBeUndefined();
  });

  it("görünen ad 2-120 karakter dışındaysa displayNameInvalid", () => {
    expect(validateCreateUserForm({ ...BASE_VALUES, displayName: "A" }).displayName).toBe("displayNameInvalid");
    expect(validateCreateUserForm({ ...BASE_VALUES, displayName: "A".repeat(121) }).displayName).toBe(
      "displayNameInvalid",
    );
    expect(validateCreateUserForm(BASE_VALUES).displayName).toBeUndefined();
  });

  it("birim seçilmezse unitRequired", () => {
    expect(validateCreateUserForm({ ...BASE_VALUES, unitId: "" }).unitId).toBe("unitRequired");
  });

  it("geçerli girdide hiç hata yoktur (hasFormErrors false)", () => {
    expect(hasFormErrors(validateCreateUserForm(BASE_VALUES))).toBe(false);
  });

  it("normalizeMappingKeyValue e-postayı küçük harfe indirir, kullanıcı adını olduğu gibi kırpar", () => {
    expect(normalizeMappingKeyValue("email", "  ORNEK@X.INVALID  ")).toBe("ornek@x.invalid");
    expect(normalizeMappingKeyValue("username", "  Ornek.Kullanici  ")).toBe("Ornek.Kullanici");
  });

  it("toggleSimAccess kümeyi değiştirmeden ekler/çıkarır", () => {
    const withPulse = toggleSimAccess([], "pulse");
    expect(withPulse).toEqual(["pulse"]);
    expect(toggleSimAccess(withPulse, "pulse")).toEqual([]);
  });

  it("isFormDirty başlangıç değerlerinde false, herhangi bir alan değişince true", () => {
    expect(isFormDirty(INITIAL_CREATE_USER_VALUES)).toBe(false);
    expect(isFormDirty({ ...INITIAL_CREATE_USER_VALUES, displayName: "x" })).toBe(true);
    expect(isFormDirty({ ...INITIAL_CREATE_USER_VALUES, simAccess: ["pulse"] })).toBe(true);
  });
});

describe("usersDataSource.ts T70 genişletmesi: ayrıntı üretimi", () => {
  it("her sentetik kayıt roller/sim erişimi/oyunlaştırma/geçmiş taşır; ilk geçmiş girdisi user.create'dir", () => {
    const users = generateSyntheticUsers(69, 120);
    for (const user of users) {
      expect(user.roles).toEqual([user.role]);
      expect(user.history[0]?.action).toBe("user.create");
      expect(user.history[0]?.occurredAt).toBe(user.createdAt);
      if (user.status === "suspended") expect(user.history.some((h) => h.action === "user.suspend")).toBe(true);
      if (user.status === "deleted") expect(user.history.some((h) => h.action === "user.delete")).toBe(true);
      for (const summary of user.gamification) {
        expect(user.simAccess).toContain(summary.simId);
        expect(summary.xp).toBeGreaterThanOrEqual(0);
        expect(summary.level).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("buildCreatedUserDetail: kullanıcı adı anahtarında email null, durum invited, rol kullanici", () => {
    const input: CreateUserInput = {
      authMethod: "sso",
      displayName: "  Örnek Öğrenci  ",
      mappingKeyType: "username",
      mappingKeyValue: "ornek.ogrenci",
      simAccess: ["pulse", "opaca"],
      unitId: "unit-2",
    };
    const created = buildCreatedUserDetail(input, Date.parse("2026-09-24T09:00:00.000Z"), "user-created-1");
    expect(created).toEqual({
      authMethod: "sso",
      createdAt: "2026-09-24T09:00:00.000Z",
      displayName: "Örnek Öğrenci",
      email: null,
      gamification: [],
      history: [{ action: "user.create", id: "user-created-1-hist-1", occurredAt: "2026-09-24T09:00:00.000Z" }],
      id: "user-created-1",
      lastLoginAt: null,
      role: "kullanici",
      roles: ["kullanici"],
      simAccess: ["pulse", "opaca"],
      status: "invited",
      unitId: "unit-2",
      username: "ornek.ogrenci",
    });
  });

  it("buildCreatedUserDetail: e-posta anahtarında email dolu, username yerel kısımdan türer", () => {
    const input: CreateUserInput = {
      authMethod: "dev",
      displayName: "Örnek Öğrenci 2",
      mappingKeyType: "email",
      mappingKeyValue: "  Ornek.Ogrenci2@Example.INVALID ",
      simAccess: [],
      unitId: "unit-1",
    };
    const created = buildCreatedUserDetail(input, 0, "user-created-2");
    expect(created.email).toBe("ornek.ogrenci2@example.invalid");
    expect(created.username).toBe("ornek.ogrenci2");
  });

  it("applyUserPatch: durum değişince geçmişe doğru eylemle girdi ekler; aynı durumda eklemez", () => {
    const suspended = applyUserPatch(DETAIL_ACTIVE, { status: "suspended" }, Date.parse("2026-03-01T00:00:00.000Z"));
    expect(suspended.status).toBe("suspended");
    expect(suspended.history).toHaveLength(2);
    expect(suspended.history[1]).toEqual({
      action: "user.suspend",
      id: "user-001-hist-2",
      occurredAt: "2026-03-01T00:00:00.000Z",
    });
    const unchanged = applyUserPatch(DETAIL_ACTIVE, { status: "active" }, 0);
    expect(unchanged.history).toHaveLength(1);
  });

  it("applyUserPatch: görünen ad ve birim yamaları kırpılıp uygulanır", () => {
    const patched = applyUserPatch(DETAIL_ACTIVE, { displayName: "  Yeni Ad  ", unitId: "unit-4" }, 0);
    expect(patched.displayName).toBe("Yeni Ad");
    expect(patched.unitId).toBe("unit-4");
  });
});

describe("createMockUsersSource: get/create/update (T70)", () => {
  it("get bilinmeyen kimlikte null, bilinen kimlikte tam ayrıntı döner", async () => {
    const source = createMockUsersSource(69, 30, () => 0);
    expect(await source.get("yok")).toBeNull();
    const found = await source.get("user-001");
    expect(found?.id).toBe("user-001");
    expect(found?.roles).toEqual([found?.role]);
  });

  it("create: enjekte edilen now ile createdAt üretir, listeye ekler, yinelenen anahtarı reddeder", async () => {
    const fixedNowMs = Date.parse("2026-09-24T09:00:00.000Z");
    const source = createMockUsersSource(69, 10, () => fixedNowMs);
    const before = await source.list({ pageSize: 100 });
    const created = await source.create({
      authMethod: "sso",
      displayName: "Yeni Kullanıcı",
      mappingKeyType: "username",
      mappingKeyValue: "yeni.kullanici",
      simAccess: [],
      unitId: "unit-1",
    });
    expect(created.createdAt).toBe("2026-09-24T09:00:00.000Z");
    expect(created.status).toBe("invited");
    const after = await source.list({ pageSize: 100 });
    expect(after.meta.total).toBe(before.meta.total + 1);
    await expect(
      source.create({
        authMethod: "sso",
        displayName: "Tekrar",
        mappingKeyType: "username",
        mappingKeyValue: "ornek.kullanici.001",
        simAccess: [],
        unitId: "unit-1",
      }),
    ).rejects.toThrow("duplicate_mapping_key");
  });

  it("update: bilinmeyen kimlikte reddeder; bilinen kimlikte durumu değiştirir ve get ile yansır", async () => {
    const source = createMockUsersSource(69, 10, () => 0);
    await expect(source.update("yok", { status: "suspended" })).rejects.toThrow("not_found");
    const updated = await source.update("user-001", { status: "suspended" });
    expect(updated.status).toBe("suspended");
    const reread = await source.get("user-001");
    expect(reread?.status).toBe("suspended");
    expect(reread?.history.some((entry) => entry.action === "user.suspend")).toBe(true);
  });

  it("Date.now hiçbir yerde kullanılmaz (create/update `now` enjeksiyonuyla çalışır)", async () => {
    const spy = vi.spyOn(Date, "now");
    const source = createMockUsersSource(69, 10, () => 12345);
    await source.create({
      authMethod: "sso",
      displayName: "X",
      mappingKeyType: "username",
      mappingKeyValue: "gecici.kullanici",
      simAccess: [],
      unitId: "unit-1",
    });
    await source.update("user-001", { status: "suspended" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("rotalar: kullanıcı ekle + ayrıntı (T70)", () => {
  it("çok segmentli ayrıntı yolu bulunamadıya düşer", () => {
    expect(resolveRoute("#/admin/kullanicilar/user-001/ekstra").kind).toBe("notFound");
  });

  it("isAdminProtected yeni rota türlerini de korur", () => {
    expect(isAdminProtected({ kind: "adminUserCreate", titleKey: "admin.users.form.title" })).toBe(true);
    expect(
      isAdminProtected({ kind: "adminUserDetail", titleKey: "admin.users.detail.routeTitle", userId: "user-001" }),
    ).toBe(true);
  });
});

describe("UserFormView yetki ve hata erişilebilirliği", () => {
  it("rol seçeneklerinde admin YOKTUR; yalnız Kullanıcı seçeneği sunulur (E3 §b)", () => {
    const html = render(createElement(UserFormView, baseFormViewProps({})));
    expect(html).not.toContain(t("admin.users.role.admin"));
    expect(html).toContain(t("admin.users.role.kullanici"));
    const roleSelect = /<select disabled="">([\s\S]*?)<\/select>/.exec(html)?.[1] ?? "";
    expect(roleSelect).toContain('value="kullanici"');
    expect(roleSelect).not.toContain("admin");
    expect((roleSelect.match(/<option/g) ?? []).length).toBe(1);
  });

  it("her doğrulama hatası kendi alanında role=alert ile görünür", () => {
    const html = render(
      createElement(
        UserFormView,
        baseFormViewProps({
          errors: { displayName: "displayNameInvalid", mappingKeyValue: "usernameInvalid", unitId: "unitRequired" },
        }),
      ),
    );
    expect(html).toContain(t("admin.users.form.error.usernameInvalid"));
    expect(html).toContain(t("admin.users.form.error.displayNameInvalid"));
    expect(html).toContain(t("admin.users.form.error.unitRequired"));
    expect((html.match(/role="alert"/g) ?? []).length).toBe(3);
    expect(html).toContain('aria-invalid="true"');
  });
});

function baseDetailViewProps(overrides: Partial<UserDetailViewProps>): UserDetailViewProps {
  return {
    actionError: false,
    currentUserId: null,
    deleteConfirmText: "",
    detail: DETAIL_ACTIVE,
    onCancelAction: noop,
    onConfirmAction: noop,
    onDeleteConfirmTextChange: noop,
    onRequestAction: noop,
    onRetry: noop,
    pendingAction: null,
    status: "ready",
    ...overrides,
  };
}

describe("UserDetailView silme güvenliği (E3 §e.3)", () => {
  it("silme onayında yazılan metin kullanıcı adıyla eşleşmezse uyarı gösterir ve Uygula devre dışıdır", () => {
    const mismatch = render(
      createElement(UserDetailView, baseDetailViewProps({ deleteConfirmText: "yanlis", pendingAction: "delete" })),
    );
    expect(mismatch).toContain(t("admin.users.detail.confirm.delete.mismatch"));
    expect(mismatch).toMatch(/<button disabled="?"?[^>]*>\s*Sil\s*<\/button>/);

    const match = render(
      createElement(
        UserDetailView,
        baseDetailViewProps({ deleteConfirmText: DETAIL_ACTIVE.username, pendingAction: "delete" }),
      ),
    );
    expect(match).not.toContain(t("admin.users.detail.confirm.delete.mismatch"));
    expect(match).not.toMatch(/<button disabled="?"?[^>]*>\s*Sil\s*<\/button>/);
  });
});
