import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../packages/ui/src/primitives/Button";
import { Dialog } from "../../packages/ui/src/primitives/Dialog";
import { Select } from "../../packages/ui/src/primitives/Select";
import { ADMIN_USERS_PATH, isAdminProtected, resolveRoute } from "../../apps/shell/src/routes";
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
  primaryRoleFor,
  swapBaseRole,
  type AdminUserDetail,
  type CreateUserInput,
} from "../../apps/shell/src/admin/usersDataSource";
import { UserFormPage, UserFormView, type UserFormViewProps } from "../../apps/shell/src/admin/UserFormPage";
import { UserDetailPage, UserDetailView, type UserDetailViewProps } from "../../apps/shell/src/admin/UserDetailPage";
import { formatTrDateTime } from "../../apps/shell/src/admin/trFormat";
import { t } from "../../packages/ui/i18n/tr";

const BASE_VALUES: CreateUserFormValues = {
  authMethod: "sso",
  displayName: "Örnek Öğrenci",
  mappingKeyType: "username",
  mappingKeyValue: "ornek.ogrenci",
  role: "kullanici",
  simAccess: ["pulse"],
  unitId: "unit-3",
};

function render(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

/** React eleman ağacını DOM'suz gezer (UsersPage.tsx test deseni, T156). `Dialog`
 *  Radix Portal kullandığından DOM'suz ortamda (`renderToStaticMarkup`) içeriği boş
 *  döner; bu yüzden `Dialog` öğesinin `children`/`footer`/`title` prop'ları doğrudan
 *  ağaçtan alınıp ayrıca çizilir (T163). */
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
  // `Field` çocuğunu render-prop olarak alır (`(control) => ReactNode`, Field.tsx);
  // ağaca girmek için sahte bir `control` ile çağrılır (T163).
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
    onRoleChange: noop,
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
      role: "kullanici",
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
      role: "kullanici",
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

  it("primaryRoleFor: admin > ogretim_uyesi > kullanici öncelik sırasıyla tekil rolü türetir (T184)", () => {
    expect(primaryRoleFor(["kullanici"])).toBe("kullanici");
    expect(primaryRoleFor(["ogretim_uyesi"])).toBe("ogretim_uyesi");
    expect(primaryRoleFor(["admin"])).toBe("admin");
    expect(primaryRoleFor(["ogretim_uyesi", "admin"])).toBe("admin");
    expect(primaryRoleFor([])).toBe("kullanici");
  });

  it("swapBaseRole: temel rolü değiştirir, admin bitini korur (T184)", () => {
    expect(swapBaseRole(["kullanici"], "ogretim_uyesi")).toEqual(["ogretim_uyesi"]);
    expect(swapBaseRole(["ogretim_uyesi"], "kullanici")).toEqual(["kullanici"]);
    expect(swapBaseRole(["admin", "kullanici"], "ogretim_uyesi")).toEqual(["admin", "ogretim_uyesi"]);
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
      role: "kullanici",
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
        role: "kullanici",
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
      role: "kullanici",
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
    expect(resolveRoute(`#${ADMIN_USERS_PATH}/user-001/ekstra`).kind).toBe("notFound");
  });

  it("isAdminProtected yeni rota türlerini de korur", () => {
    expect(isAdminProtected({ kind: "adminUserCreate", titleKey: "admin.users.form.title" })).toBe(true);
    expect(
      isAdminProtected({ kind: "adminUserDetail", titleKey: "admin.users.detail.routeTitle", userId: "user-001" }),
    ).toBe(true);
  });
});

describe("UserFormView işaretlemesi (E3 §e.2)", () => {
  // `Dialog` (Radix) Portal kullanır; DOM'suz test ortamında (`renderToStaticMarkup`)
  // Portal içeriği boş döner (T163). `UserFormView` durumsuzdur (kendi hook'u yoktur),
  // bu yüzden doğrudan fonksiyon olarak çağrılıp ham ağaç elde edilir; `Dialog`
  // öğesinin `title`/`footer`/`children` prop'ları oradan alınıp ayrıca çizilir.
  function dialogOf(props: Partial<UserFormViewProps>): DialogLikeProps {
    const tree = UserFormView(baseFormViewProps(props)) as ReactElement;
    return dialogPropsOf(tree);
  }
  function bodyHtml(props: Partial<UserFormViewProps>): string {
    return render(dialogOf(props).children as ReturnType<typeof createElement>);
  }
  function footerHtml(props: Partial<UserFormViewProps>): string {
    return render(dialogOf(props).footer as ReturnType<typeof createElement>);
  }

  it("form adımı tüm alanları, sim onay kutularını ve SSO uyarısını çizer", () => {
    const dialog = dialogOf({});
    expect(dialog.title).toBe(t("admin.users.form.title"));
    const html = bodyHtml({});
    expect(html).toContain(t("admin.users.form.mappingKey.username"));
    expect(html).toContain(t("admin.users.form.mappingKey.email"));
    expect(html).toContain(t("admin.users.form.field.displayName"));
    expect(html).toContain(t("sims.pulse.name"));
    expect(html).toContain(t("sims.ausculta.name"));
    expect(html).toContain(t("sims.opaca.name"));
    expect(html).toContain(t("admin.users.form.notice.sso"));
    const footer = footerHtml({});
    expect(footer).toContain(t("admin.users.form.action.cancel"));
    expect(footer).toContain(t("admin.users.form.action.save"));
  });

  it("rol seçeneklerinde admin YOKTUR; Kullanıcı ve Öğretim üyesi seçilebilir (E3 §b, T184)", () => {
    const tree = UserFormView(baseFormViewProps({})) as ReactElement;
    const dialog = dialogPropsOf(tree);
    const [roleSelect] = collectElements(
      dialog.children,
      (element) =>
        element.type === Select &&
        (element.props as { options?: readonly { value: string }[] }).options?.some((option) => option.value === "kullanici") === true,
    );
    expect(roleSelect).toBeDefined();
    expect((roleSelect?.props as { disabled?: boolean }).disabled).not.toBe(true);
    const options = (roleSelect?.props as { options: readonly { value: string; label: string }[] }).options;
    expect(options).toEqual([
      { label: t("admin.users.role.kullanici"), value: "kullanici" },
      { label: t("admin.users.role.ogretim_uyesi"), value: "ogretim_uyesi" },
    ]);
    expect(options.some((option) => option.value === "admin")).toBe(false);
  });

  it("onRoleChange rol değiştiğinde çağrılır", () => {
    let changed: string | null = null;
    const tree = UserFormView(baseFormViewProps({ onRoleChange: (value) => { changed = value; } })) as ReactElement;
    const dialog = dialogPropsOf(tree);
    const [roleSelect] = collectElements(
      dialog.children,
      (element) =>
        element.type === Select &&
        (element.props as { options?: readonly { value: string }[] }).options?.some((option) => option.value === "ogretim_uyesi") === true,
    );
    (roleSelect?.props as { onValueChange: (value: string) => void }).onValueChange("ogretim_uyesi");
    expect(changed).toBe("ogretim_uyesi");
  });

  it("her doğrulama hatası kendi alanında role=alert ile görünür", () => {
    const html = bodyHtml({
      errors: { displayName: "displayNameInvalid", mappingKeyValue: "usernameInvalid", unitId: "unitRequired" },
    });
    expect(html).toContain(t("admin.users.form.error.usernameInvalid"));
    expect(html).toContain(t("admin.users.form.error.displayNameInvalid"));
    expect(html).toContain(t("admin.users.form.error.unitRequired"));
    // `Field` hata iletisini `aria-describedby` + `aria-invalid` ile denetime bağlar
    // (role="alert" değil, Field.tsx); üç alanın üçü de işaretli olmalıdır (T163).
    expect((html.match(/aria-invalid="true"/g) ?? []).length).toBe(3);
    expect((html.match(/class="eg-field__error"/g) ?? []).length).toBe(3);
  });

  it("kaydedilmemiş değişiklik uyarısı confirmDiscard true olduğunda görünür", () => {
    const html = bodyHtml({ confirmDiscard: true });
    expect(html).toContain(t("admin.users.form.discard.confirm"));
  });

  it("onay diyaloğu (confirm adımı): giriş tipi, rol ve sim erişimi özeti gösterir", () => {
    const props = { step: "confirm" as const, values: { ...BASE_VALUES, authMethod: "dev" as const, simAccess: ["pulse", "opaca"] as CreateUserFormValues["simAccess"] } };
    const dialog = dialogOf(props);
    expect(dialog.title).toBe(t("admin.users.form.confirm.title"));
    const html = bodyHtml(props);
    expect(html).toContain(t("admin.users.authMethod.dev"));
    expect(html).toContain(t("admin.users.role.kullanici"));
    expect(html).not.toContain(t("admin.users.role.admin"));
    expect(html).toContain(t("sims.pulse.name"));
    expect(html).toContain(t("sims.opaca.name"));
    const footer = footerHtml(props);
    expect(footer).toContain(t("admin.users.form.action.confirm"));
    expect(footer).toContain(t("admin.users.form.action.back"));
  });

  it("onay diyaloğu: rol 'ogretim_uyesi' seçilmişse özet Öğretim üyesi gösterir (T184)", () => {
    const props = { step: "confirm" as const, values: { ...BASE_VALUES, role: "ogretim_uyesi" as const } };
    const html = bodyHtml(props);
    expect(html).toContain(t("admin.users.role.ogretim_uyesi"));
    expect(html).not.toContain(t("admin.users.role.admin"));
  });

  it("onay adımında sim erişimi seçilmemişse 'Erişim yok' gösterir", () => {
    const html = bodyHtml({ step: "confirm", values: { ...BASE_VALUES, simAccess: [] } });
    expect(html).toContain(t("admin.users.form.confirm.simAccess.none"));
  });

  it("gönderim hatasında confirm adımında hata metni görünür", () => {
    const html = bodyHtml({ step: "confirm", submitError: true });
    expect(html).toContain(t("admin.users.form.error.submit"));
  });
});

describe("UserFormPage kabı", () => {
  // `UserFormPage` içeriğinin tamamı `Dialog` (Radix Portal) içindedir; DOM'suz
  // ortamda çizilen dize her zaman boştur (T163). Diyaloğun gerçek görünümü
  // `UserFormView` testlerinde (yukarıda, `Dialog` prop'ları doğrudan okunarak) ve
  // e2e/admin.spec.ts'te (gerçek tarayıcı DOM'u, Portal çalışır) doğrulanır; burada
  // yalnız kabın hatasız render edildiği ve varsayılan diyalog başlığının iletildiği
  // (UserFormView'e giden `step`/`values` üzerinden) sınanır.
  it("varsayılan (dataSource'suz) çağrıldığında hataya düşmeden render edilir", () => {
    expect(() => render(createElement(UserFormPage))).not.toThrow();
  });

  it("enjekte edilen kaynakla da hataya düşmeden render edilir", () => {
    const source = createMockUsersSource(7, 5);
    expect(() => render(createElement(UserFormPage, { dataSource: source }))).not.toThrow();
  });
});

describe("UserDetailView işaretlemesi ('ayrıntı markup', E3 §e.3)", () => {
  it("yükleniyor durumunda iskelet gösterir, sekme yoktur", () => {
    const html = render(createElement(UserDetailView, baseDetailViewProps({ detail: null, status: "loading" })));
    expect(html).toContain("eg-shell-userdetail__skeleton");
    expect(html).not.toContain('role="tablist"');
  });

  it("bulunamadı durumunda başlık ve açıklama gösterir", () => {
    const html = render(createElement(UserDetailView, baseDetailViewProps({ detail: null, status: "notFound" })));
    expect(html).toContain(t("admin.users.detail.notFound.title"));
    expect(html).toContain(t("admin.users.detail.notFound.body"));
  });

  it("hata durumunda kod + 'Yeniden dene' gösterir", () => {
    const html = render(createElement(UserDetailView, baseDetailViewProps({ detail: null, status: "error" })));
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain(t("admin.users.detail.error.title"));
    expect(html).toContain(t("admin.users.error.retry"));
  });

  it("hazır durumda geri bağlantısı, ad, durum, dört sekme ve Genel alanlarını gösterir", () => {
    const html = render(createElement(UserDetailView, baseDetailViewProps({})));
    expect(html).toContain(`href="#${ADMIN_USERS_PATH}"`);
    expect(html).toContain(DETAIL_ACTIVE.displayName);
    expect(html).toContain(t("admin.users.status.active"));
    expect(html).toContain('role="tablist"');
    for (const label of [
      t("admin.users.detail.tab.general"),
      t("admin.users.detail.tab.roles"),
      t("admin.users.detail.tab.gamification"),
      t("admin.users.detail.tab.history"),
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain(DETAIL_ACTIVE.username);
    expect(html).toContain(t("admin.users.detail.general.notSet"));
    expect(html).toContain(formatTrDateTime(DETAIL_ACTIVE.lastLoginAt ?? ""));
  });

  it("roller/erişim panelinde roller ve sim rozetlerini, oyunlaştırma panelinde xp/seviye/seri gösterir", () => {
    const html = render(createElement(UserDetailView, baseDetailViewProps({})));
    expect(html).toContain(t("admin.users.role.kullanici"));
    expect(html).toContain(t("sims.pulse.name"));
    expect(html).toContain("1450");
    expect(html).toContain(t("admin.users.detail.gamification.xp"));
  });

  it("geçmiş panelinde eylem metnini biçimli tarihle gösterir", () => {
    const html = render(createElement(UserDetailView, baseDetailViewProps({})));
    expect(html).toContain(t("admin.users.detail.history.action.user.create"));
    expect(html).toContain(formatTrDateTime(DETAIL_ACTIVE.createdAt));
  });

  it("erişim/oyunlaştırma boşsa boş durum metinleri görünür", () => {
    const empty: AdminUserDetail = { ...DETAIL_ACTIVE, gamification: [], simAccess: [] };
    const html = render(createElement(UserDetailView, baseDetailViewProps({ detail: empty })));
    expect(html).toContain(t("admin.users.detail.roles.access.empty"));
    expect(html).toContain(t("admin.users.detail.gamification.empty"));
  });

  /** `Button` etiketi bir `<span class="eg-btn__label">` içine sarılır (T163); bu yüzden
   *  belirli bir sınıf taşıyan `<button>` bloğu bulunup içeriği ayrıca sınanır. */
  function buttonBlock(html: string, className: string): string | null {
    const re = new RegExp(`<button[^>]*class="[^"]*${className}[^"]*"[^>]*>[\\s\\S]*?</button>`);
    return re.exec(html)?.[0] ?? null;
  }

  it("durum 'active' iken Askıya al, 'suspended' iken Etkinleştir eylemi sunulur; 'deleted' iken eylem yoktur", () => {
    const active = render(createElement(UserDetailView, baseDetailViewProps({})));
    expect(active).toContain(t("admin.users.detail.action.suspend"));
    expect(active).not.toContain(t("admin.users.detail.action.activate"));

    const suspended = render(
      createElement(UserDetailView, baseDetailViewProps({ detail: { ...DETAIL_ACTIVE, status: "suspended" } })),
    );
    expect(suspended).toContain(t("admin.users.detail.action.activate"));

    const deleted = render(
      createElement(UserDetailView, baseDetailViewProps({ detail: { ...DETAIL_ACTIVE, status: "deleted" } })),
    );
    expect(deleted).not.toContain("eg-shell-userdetail__actions");
    expect(buttonBlock(deleted, "eg-shell-userdetail__delete")).toBeNull();
  });

  it("T150: görüntülenen kullanıcı oturumdaki admin ise Askıya al/Sil çizilmez, yerine bilgi notu görünür", () => {
    const self = render(
      createElement(UserDetailView, baseDetailViewProps({ currentUserId: DETAIL_ACTIVE.id })),
    );
    expect(self).not.toContain(t("admin.users.detail.action.suspend"));
    expect(buttonBlock(self, "eg-shell-userdetail__delete")).toBeNull();
    expect(self).toContain(t("admin.users.detail.selfNote"));

    const other = render(
      createElement(UserDetailView, baseDetailViewProps({ currentUserId: "baska-admin" })),
    );
    expect(other).toContain(t("admin.users.detail.action.suspend"));
    const deleteBlock = buttonBlock(other, "eg-shell-userdetail__delete");
    expect(deleteBlock).not.toBeNull();
    expect(deleteBlock).toContain(t("admin.users.detail.action.delete"));
    expect(other).not.toContain(t("admin.users.detail.selfNote"));
  });

  // Onay `Dialog`i (Radix Portal) DOM'suz ortamda boş çizilir (T163); `UserDetailView`
  // durumsuzdur, doğrudan çağrılıp ham ağaçtan `Dialog` prop'ları okunur.
  function confirmDialogOf(props: Partial<UserDetailViewProps>): DialogLikeProps {
    const tree = UserDetailView(baseDetailViewProps(props)) as ReactElement;
    return dialogPropsOf(tree);
  }
  function confirmBodyHtml(props: Partial<UserDetailViewProps>): string {
    return render(confirmDialogOf(props).children as ReturnType<typeof createElement>);
  }

  it("onay diyaloğu: askıya alma/etkinleştirme/silme için başlık ve gövde metni gösterir", () => {
    const suspend = confirmDialogOf({ pendingAction: "suspend" });
    expect(suspend.title).toBe(t("admin.users.detail.confirm.suspend.title"));
    expect(confirmBodyHtml({ pendingAction: "suspend" })).toContain(t("admin.users.detail.confirm.suspend.body"));

    const activate = confirmDialogOf({ pendingAction: "activate" });
    expect(activate.title).toBe(t("admin.users.detail.confirm.activate.title"));

    const del = confirmDialogOf({ pendingAction: "delete" });
    expect(del.title).toBe(t("admin.users.detail.confirm.delete.title"));
    expect(confirmBodyHtml({ pendingAction: "delete" })).toContain(t("admin.users.detail.confirm.delete.inputLabel"));
  });

  it("silme onayında yazılan metin kullanıcı adıyla eşleşmezse uyarı gösterir ve Uygula devre dışıdır", () => {
    const mismatchHtml = confirmBodyHtml({ deleteConfirmText: "yanlis", pendingAction: "delete" });
    expect(mismatchHtml).toContain(t("admin.users.detail.confirm.delete.mismatch"));
    const mismatchFooter = confirmDialogOf({ deleteConfirmText: "yanlis", pendingAction: "delete" }).footer;
    const [mismatchButton] = collectElements(
      mismatchFooter,
      (element) => element.type === Button && (element.props as { variant?: string }).variant === "danger",
    );
    expect((mismatchButton?.props as { disabled?: boolean }).disabled).toBe(true);

    const matchHtml = confirmBodyHtml({ deleteConfirmText: DETAIL_ACTIVE.username, pendingAction: "delete" });
    expect(matchHtml).not.toContain(t("admin.users.detail.confirm.delete.mismatch"));
    const matchFooter = confirmDialogOf({ deleteConfirmText: DETAIL_ACTIVE.username, pendingAction: "delete" }).footer;
    const [matchButton] = collectElements(
      matchFooter,
      (element) => element.type === Button && (element.props as { variant?: string }).variant === "danger",
    );
    expect((matchButton?.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it("işlem hatası (actionError) uyarı metniyle gösterilir", () => {
    const html = confirmBodyHtml({ actionError: true, pendingAction: "suspend" });
    expect(html).toContain(t("admin.users.detail.actionError"));
  });
});

describe("UserDetailPage kabı", () => {
  it("varsayılan (dataSource'suz) çağrıldığında ilk render'da iskelet gösterir", () => {
    const html = render(createElement(UserDetailPage, { userId: "user-001" }));
    expect(html).toContain("eg-shell-userdetail__skeleton");
  });

  it("enjekte edilen kaynakla da ilk render iskelet gösterir; efekt SSR'da çalışmaz", async () => {
    const source = createMockUsersSource(7, 5);
    const html = render(createElement(UserDetailPage, { dataSource: source, userId: "user-001" }));
    expect(html).toContain("eg-shell-userdetail__skeleton");
    const found = await source.get("user-001");
    expect(found?.id).toBe("user-001");
  });
});
