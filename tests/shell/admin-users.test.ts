import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "../../packages/ui/src/primitives/DataTable";
import {
  ADMIN_USERS_PATH,
  adminGuardHref,
  adminUserCreateHref,
  adminUserDetailHref,
  adminUsersHref,
  entryHref,
  isAdminProtected,
  resolveRoute,
} from "../../apps/shell/src/routes";
import {
  ADMIN_UNITS,
  applyUsersQuery,
  clampPage,
  clampPageSize,
  createMockUsersSource,
  generateSyntheticUsers,
  hasActiveFilters,
  matchesUserQuery,
  MAX_PAGE_SIZE,
  paginateUsers,
  sortUsers,
  toggleSelected,
  unitNameFor,
  type AdminUser,
} from "../../apps/shell/src/admin/usersDataSource";
import {
  parseSortChoice,
  sortChoiceFor,
  UsersListView,
  UsersPage,
  type UsersListViewProps,
} from "../../apps/shell/src/admin/UsersPage";
import { t } from "../../packages/ui/i18n/tr";
import { describe, expect, it, vi } from "vitest";

const count = (html: string, needle: string): number => html.split(needle).length - 1;

const USER_A: AdminUser = {
  authMethod: "sso",
  createdAt: "2026-01-10T09:00:00.000+03:00",
  displayName: "Örnek Kullanıcı 001",
  id: "user-001",
  lastLoginAt: "2026-02-05T09:00:00.000+03:00",
  role: "kullanici",
  status: "active",
  unitId: "unit-3",
  username: "ornek.kullanici.001",
};
const USER_B: AdminUser = {
  authMethod: "dev",
  createdAt: "2026-01-11T09:00:00.000+03:00",
  displayName: "Örnek Kullanıcı 002",
  id: "user-002",
  lastLoginAt: null,
  role: "admin",
  status: "invited",
  unitId: "unit-1",
  username: "ornek.kullanici.002",
};
const SAMPLE_USERS: readonly AdminUser[] = [USER_A, USER_B];

function noop(): void {
  // yalnız zorunlu prop'u doldurur; ilgisiz durumlarda çağrılmaz
}

/** React eleman ağacını DOM'suz gezer; statik render olay taşımadığı için testler
 *  ilgili düğümün props'unu (ör. `onChange`) doğrudan çağırıp doğrular. */
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
  if (children !== undefined) collectElements(children, predicate, results);
  return results;
}

interface TestColumn { readonly key: string; readonly cell: (user: AdminUser) => unknown }

/** `UsersListView`'in çizdiği `DataTable` öğesini bulur ve "select" sütununu döner (T156):
 *  statik ağaç iç içe fonksiyon bileşenlerini genişletmediği için `DataTable`'ın `columns`
 *  prop'undaki `cell` işlevi doğrudan çağrılıp test edilir. */
function findSelectColumn(tree: ReactElement): TestColumn {
  const [dataTableElement] = collectElements(tree, (element) => element.type === DataTable);
  if (dataTableElement === undefined) throw new Error("DataTable öğesi bulunamadı");
  const columns = (dataTableElement.props as { columns: readonly TestColumn[] }).columns;
  const selectColumn = columns.find((column) => column.key === "select");
  if (selectColumn === undefined) throw new Error("select sütunu bulunamadı");
  return selectColumn;
}

function baseViewProps(overrides: Partial<UsersListViewProps>): UsersListViewProps {
  return {
    bulkApplyResult: null,
    bulkApplyStatus: "idle",
    bulkOpen: false,
    bulkOperation: "set_status",
    bulkPreview: null,
    bulkPreviewStatus: "idle",
    bulkValue: "active",
    filtersOpen: false,
    onBulkApply: noop,
    onBulkOperationChange: noop,
    onBulkValueChange: noop,
    onClearFilters: noop,
    onClearSelection: noop,
    onCloseBulk: noop,
    onFilterChange: noop,
    onFiltersOpenChange: noop,
    onOpenBulk: noop,
    onPageChange: noop,
    onRetry: noop,
    onSearchChange: noop,
    onSortChange: noop,
    onToggleSelect: noop,
    query: {},
    result: null,
    selected: new Set(),
    status: "loading",
    units: ADMIN_UNITS,
    ...overrides,
  };
}

describe("sentetik kullanıcı kaynağı determinizmi", () => {
  it("farklı tohum farklı sonuç verir", () => {
    const first = generateSyntheticUsers(69, 50);
    expect(first[0]).toMatchObject({
      authMethod: "dev",
      createdAt: "2026-08-21T06:00:00.000Z",
      id: "user-001",
      status: "suspended",
      unitId: "unit-2",
    });
    const other = generateSyntheticUsers(70, 50);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(first));
  });

  it("her kayıt geçerli alan kümesi ve benzersiz kimlik taşır; gerçek kişi adı yoktur", () => {
    const users = generateSyntheticUsers(69, 120);
    expect(new Set(users.map((user) => user.id)).size).toBe(120);
    for (const user of users) {
      expect(["admin", "kullanici"]).toContain(user.role);
      expect(["invited", "active", "suspended", "deleted"]).toContain(user.status);
      expect(["sso", "dev"]).toContain(user.authMethod);
      expect(ADMIN_UNITS.some((unit) => unit.id === user.unitId)).toBe(true);
      expect(user.displayName).toMatch(/^Örnek Kullanıcı \d{3}$/);
      expect(user.username).toMatch(/^ornek\.kullanici\.\d{3}$/);
      expect(Number.isNaN(Date.parse(user.createdAt))).toBe(false);
      if (user.lastLoginAt !== null) expect(Number.isNaN(Date.parse(user.lastLoginAt))).toBe(false);
      if (user.status === "invited" || user.status === "deleted") expect(user.lastLoginAt).toBeNull();
    }
  });

  it("createMockUsersSource sözleşmeye uygun {data, meta} döner", async () => {
    const first = await createMockUsersSource(69, 30).list({ page: 1, pageSize: 10 });
    expect(first.data[0]).toMatchObject({ id: "user-001", status: "suspended", unitId: "unit-2" });
    expect(first.data.length).toBeLessThanOrEqual(10);
    expect(first.meta).toEqual({ page: 1, pageSize: 10, total: 30 });
  });
});

describe("filtre saf fonksiyonu (matchesUserQuery)", () => {
  it("rol, birim, durum ve giriş tipini ayrı ayrı süzer", () => {
    expect(matchesUserQuery(USER_A, { role: "kullanici" })).toBe(true);
    expect(matchesUserQuery(USER_A, { role: "admin" })).toBe(false);
    expect(matchesUserQuery(USER_A, { unitId: "unit-3" })).toBe(true);
    expect(matchesUserQuery(USER_A, { unitId: "unit-1" })).toBe(false);
    expect(matchesUserQuery(USER_B, { status: "invited" })).toBe(true);
    expect(matchesUserQuery(USER_B, { status: "active" })).toBe(false);
    expect(matchesUserQuery(USER_B, { authMethod: "dev" })).toBe(true);
    expect(matchesUserQuery(USER_B, { authMethod: "sso" })).toBe(false);
  });

  it("arama ad/kullanıcı adında büyük-küçük harf duyarsız alt dize eşleşmesidir", () => {
    expect(matchesUserQuery(USER_A, { q: "kullanıcı 001" })).toBe(true);
    expect(matchesUserQuery(USER_A, { q: "ORNEK.KULLANICI.001" })).toBe(true);
    expect(matchesUserQuery(USER_A, { q: "  001  " })).toBe(true);
    expect(matchesUserQuery(USER_A, { q: "999" })).toBe(false);
    expect(matchesUserQuery(USER_A, { q: "  " })).toBe(true);
  });

  it("boş sorgu her kaydı eşler", () => {
    expect(matchesUserQuery(USER_A, {})).toBe(true);
    expect(matchesUserQuery(USER_B, {})).toBe(true);
  });
});

describe("hasActiveFilters", () => {
  it("yalnız arama/rol/birim/durum/giriş filtrelerinden biri varsa true döner", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ order: "asc", page: 2, pageSize: 20, sort: "displayName" })).toBe(false);
    expect(hasActiveFilters({ q: "  " })).toBe(false);
    expect(hasActiveFilters({ q: "a" })).toBe(true);
    expect(hasActiveFilters({ role: "admin" })).toBe(true);
    expect(hasActiveFilters({ unitId: "unit-1" })).toBe(true);
    expect(hasActiveFilters({ status: "active" })).toBe(true);
    expect(hasActiveFilters({ authMethod: "dev" })).toBe(true);
  });
});

describe("sıralama saf fonksiyonu (sortUsers)", () => {
  it("ada göre artan/azalan sıralar", () => {
    expect(sortUsers(SAMPLE_USERS, "displayName", "asc").map((u) => u.id)).toEqual(["user-001", "user-002"]);
    expect(sortUsers(SAMPLE_USERS, "displayName", "desc").map((u) => u.id)).toEqual(["user-002", "user-001"]);
  });
  it("kayıt tarihine ve son girişe göre sıralar; null son giriş en sona düşer", () => {
    expect(sortUsers(SAMPLE_USERS, "createdAt", "desc").map((u) => u.id)).toEqual(["user-002", "user-001"]);
    expect(sortUsers(SAMPLE_USERS, "lastLoginAt", "asc").map((u) => u.id)).toEqual(["user-002", "user-001"]);
  });
  it("girdi dizisini değiştirmez (saf)", () => {
    const copy = [...SAMPLE_USERS];
    sortUsers(SAMPLE_USERS, "displayName", "desc");
    expect(SAMPLE_USERS).toEqual(copy);
  });
});

describe("sayfalama saf fonksiyonları", () => {
  it("clampPage/clampPageSize geçersiz girdide varsayılana, aşırı büyükte tavana kilitlenir", () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage(0)).toBe(1);
    expect(clampPage(-5)).toBe(1);
    expect(clampPage(3.9)).toBe(3);
    expect(clampPageSize(undefined)).toBe(20);
    expect(clampPageSize(0)).toBe(20);
    expect(clampPageSize(5)).toBe(5);
    expect(clampPageSize(MAX_PAGE_SIZE + 50)).toBe(MAX_PAGE_SIZE);
  });
  it("paginateUsers doğru dilimi döner; sayfa aralık dışındaysa boş dizi", () => {
    const users = generateSyntheticUsers(1, 25);
    expect(paginateUsers(users, 1, 10)).toHaveLength(10);
    expect(paginateUsers(users, 3, 10)).toHaveLength(5);
    expect(paginateUsers(users, 99, 10)).toHaveLength(0);
  });
  it("applyUsersQuery filtre SONRASI toplamı meta.total'da taşır, sayfalama yalnız dilimlemedir", () => {
    const users = generateSyntheticUsers(5, 200);
    const kullaniciCount = users.filter((user) => user.role === "kullanici").length;
    const result = applyUsersQuery(users, { page: 1, pageSize: 10, role: "kullanici" });
    expect(result.meta.total).toBe(kullaniciCount);
    expect(result.data.length).toBe(Math.min(10, kullaniciCount));
    expect(result.data.every((user) => user.role === "kullanici")).toBe(true);
  });
});

describe("toggleSelected ve unitNameFor", () => {
  it("kümeyi değiştirmeden ekler/çıkarır", () => {
    const empty = new Set<string>();
    const withA = toggleSelected(empty, "user-001");
    expect(withA.has("user-001")).toBe(true);
    expect(empty.has("user-001")).toBe(false);
    const withoutA = toggleSelected(withA, "user-001");
    expect(withoutA.has("user-001")).toBe(false);
  });
  it("bilinen birim kimliğini ada çevirir, bilinmeyende kimliği döner", () => {
    expect(unitNameFor("unit-3", ADMIN_UNITS)).toBe("3. Sınıf");
    expect(unitNameFor("unit-yok", ADMIN_UNITS)).toBe("unit-yok");
  });
});

describe("sıralama seçim değeri (sortChoiceFor/parseSortChoice)", () => {
  it("gidiş-dönüş korunur", () => {
    for (const sort of ["displayName", "createdAt", "lastLoginAt"] as const) {
      for (const order of ["asc", "desc"] as const) {
        const choice = sortChoiceFor(sort, order);
        expect(parseSortChoice(choice)).toEqual({ order, sort });
      }
    }
  });
});

describe("#/admin/kullanicilar rotası ve koruması", () => {
  it("yolu 'adminUsers' olarak çözer; sondaki '/' ve sorgu yok sayılır", () => {
    for (const hash of [`#${ADMIN_USERS_PATH}`, `#${ADMIN_USERS_PATH}/`, `#${ADMIN_USERS_PATH}?x=1`]) {
      expect(resolveRoute(hash), hash).toEqual({ kind: "adminUsers", titleKey: "admin.users.title" });
    }
  });
  it("adminUsersHref #/admin rotasına çözülmez, kendi yoluna gider", () => {
    expect(adminUsersHref()).toBe(`#${ADMIN_USERS_PATH}`);
    expect(resolveRoute(adminUsersHref())).toEqual({ kind: "adminUsers", titleKey: "admin.users.title" });
  });
  it("ayrıntı rotası (#/admin/kullanicilar/:id, T70) kullanıcı kimliğiyle çözülür", () => {
    const href = adminUserDetailHref("user-001");
    expect(href).toBe(`#${ADMIN_USERS_PATH}/user-001`);
    expect(resolveRoute(href)).toEqual({
      kind: "adminUserDetail",
      titleKey: "admin.users.detail.routeTitle",
      userId: "user-001",
    });
  });
  it("kullanıcı ekle rotası (#/admin/kullanicilar/yeni, T70) çözülür", () => {
    const href = adminUserCreateHref();
    expect(href).toBe(`#${ADMIN_USERS_PATH}/yeni`);
    expect(resolveRoute(href)).toEqual({ kind: "adminUserCreate", titleKey: "admin.users.form.title" });
  });
  it("admin panelle aynı korumayı paylaşır: oturumsuz erişim girişe döner", () => {
    expect(isAdminProtected({ kind: "adminUsers", titleKey: "admin.users.title" })).toBe(true);
    expect(isAdminProtected({ kind: "admin", titleKey: "admin.title" })).toBe(true);
    expect(isAdminProtected({ kind: "page", route: { id: "home", labelKey: "shell.nav.home", path: "/", titleKey: "shell.home.title" } })).toBe(false);
    expect(adminGuardHref(null)).toBe(entryHref("admin"));
    expect(adminGuardHref({ role: "student" })).toBe(entryHref("admin"));
    expect(adminGuardHref({ role: "admin" })).toBeNull();
  });
});

describe("UsersListView işaretlemesi", () => {
  const READY_META = { page: 1, pageSize: 20, total: SAMPLE_USERS.length };

  it("tablo başlıklarını (@egemed/ui DataTable, T156) ve durum rozetlerini metinle çizer", () => {
    const html = renderToStaticMarkup(
      createElement(UsersListView, baseViewProps({ result: { data: SAMPLE_USERS, meta: READY_META }, status: "ready" })),
    );
    for (const key of [
      "admin.users.table.name",
      "admin.users.table.username",
      "admin.users.table.role",
      "admin.users.table.unit",
      "admin.users.table.status",
    ] as const) {
      expect(html, key).toContain(t(key));
    }
    expect(html).toContain('class="eg-dtable eg-dtable--stack"');
    expect(count(html, "eg-check__control")).toBe(SAMPLE_USERS.length);
    expect(html).toContain(t("admin.users.status.active"));
    expect(html).toContain(t("admin.users.status.invited"));
    expect(html).toContain(`href="${adminUserDetailHref("user-001")}"`);
    expect(html).toContain("Örnek Kullanıcı 001");
    expect(html).not.toContain("CLIX");
  });

  it("boş veri kümesinde table.empty + devre dışı 'Kullanıcı ekle' gösterir", () => {
    const html = renderToStaticMarkup(
      createElement(
        UsersListView,
        baseViewProps({ query: {}, result: { data: [], meta: { page: 1, pageSize: 20, total: 0 } }, status: "ready" }),
      ),
    );
    expect(html).toContain(t("table.empty"));
    expect(count(html, t("admin.users.action.add"))).toBe(2); // üst çubuk + boş durum
    expect(count(html, `href="${adminUserCreateHref()}"`)).toBe(2); // T70: artık gerçek bağlantı
    expect(html).not.toContain(t("admin.users.filtered.empty"));
  });

  it("filtreli boş sonuçta 'filtreleri temizle' eylemiyle ayrı bir metin gösterir", () => {
    const html = renderToStaticMarkup(
      createElement(
        UsersListView,
        baseViewProps({
          query: { q: "zzz-yok" },
          result: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
          status: "ready",
        }),
      ),
    );
    expect(html).toContain(t("admin.users.filtered.empty"));
    expect(html).toContain(t("admin.users.filter.clear"));
    expect(html).not.toContain(t("table.empty"));
  });

  it("yükleniyor durumunda DataTable'ın kendi iskeleti (aria-busy) çizilir, hata durumunda kod + 'Yeniden dene' gösterir", () => {
    const loading = renderToStaticMarkup(createElement(UsersListView, baseViewProps({ status: "loading" })));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain("eg-shell-users__error");

    const error = renderToStaticMarkup(createElement(UsersListView, baseViewProps({ status: "error" })));
    expect(error).toMatch(/role="alert"/);
    expect(error).toContain(t("admin.users.error.title"));
    expect(error).toContain(t("admin.users.error.body"));
    expect(error).toContain(t("admin.users.error.retry"));
  });

  it("aria-live bölgesi seçim sayısını duyurur; seçim yokken çubuk gizlenir", () => {
    const withResult = { data: SAMPLE_USERS, meta: READY_META };
    const none = renderToStaticMarkup(
      createElement(UsersListView, baseViewProps({ result: withResult, selected: new Set(), status: "ready" })),
    );
    expect(none).toContain('<p aria-live="polite" class="eg-visually-hidden"></p>');
    expect(none).not.toContain("eg-shell-users__bulkbar");

    const two = renderToStaticMarkup(
      createElement(
        UsersListView,
        baseViewProps({ result: withResult, selected: new Set(["user-001", "user-002"]), status: "ready" }),
      ),
    );
    expect(two).toContain(`<p aria-live="polite" class="eg-visually-hidden">2 ${t("admin.users.selection.suffix")}</p>`);
    expect(two).toContain("eg-shell-users__bulkbar");
    expect(two).toContain(t("admin.users.bulk.open"));
  });

  it("Escape tuşu seçim temizleme geri çağrısını tetikler (klavye sözleşmesi)", () => {
    let cleared = 0;
    const tree = UsersListView(
      baseViewProps({
        onClearSelection: () => {
          cleared += 1;
        },
        result: { data: SAMPLE_USERS, meta: READY_META },
        selected: new Set(["user-001"]),
        status: "ready",
      }),
    ) as ReactElement;
    const children = (tree.props as { children: ReactElement[] }).children;
    const body = children.find(
      (child) => (child?.props as { className?: string } | undefined)?.className === "eg-shell-users__body",
    );
    expect(body).toBeDefined();
    const onKeyDown = (body?.props as { onKeyDown?: (event: { key: string }) => void }).onKeyDown;
    onKeyDown?.({ key: "A" });
    expect(cleared).toBe(0);
    onKeyDown?.({ key: "Escape" });
    expect(cleared).toBe(1);
  });

  it("seçim sütunu hücreleri onToggleSelect'i doğru kimlikle çağırır (DataTable columns, T156)", () => {
    const calls: string[] = [];
    const tree = UsersListView(
      baseViewProps({
        onToggleSelect: (id) => calls.push(id),
        result: { data: SAMPLE_USERS, meta: READY_META },
        status: "ready",
      }),
    ) as ReactElement;
    const html = renderToStaticMarkup(tree);
    expect(html).toContain(`href="${adminUserDetailHref("user-001")}"`);
    expect(html).toContain(`href="${adminUserDetailHref("user-002")}"`);
    const selectColumn = findSelectColumn(tree);
    // Statik işaretleme olay taşımaz; sütunun `cell` işlevini doğrudan çağırıp
    // döndürdüğü `Checkbox` öğesinin geri çağrısını tetikleriz.
    const checkboxA = selectColumn.cell(USER_A) as ReactElement;
    const checkboxB = selectColumn.cell(USER_B) as ReactElement;
    (checkboxA.props as { onCheckedChange: (checked: boolean) => void }).onCheckedChange(true);
    (checkboxB.props as { onCheckedChange: (checked: boolean) => void }).onCheckedChange(true);
    expect(calls).toEqual(["user-001", "user-002"]);
  });

  it("T150: oturumdaki adminin kendi satırında seçim kutusu devre dışıdır ve not içerir; diğer satır etkin kalır", () => {
    const tree = UsersListView(
      baseViewProps({
        currentUserId: "user-001",
        onToggleSelect: () => {
          // yalnız zorunlu prop; bu testte çağrılmaz
        },
        result: { data: SAMPLE_USERS, meta: READY_META },
        status: "ready",
      }),
    ) as ReactElement;
    const selectColumn = findSelectColumn(tree);
    const selfCheckbox = selectColumn.cell(USER_A) as ReactElement;
    const otherCheckbox = selectColumn.cell(USER_B) as ReactElement;
    const selfProps = selfCheckbox.props as { disabled?: boolean; label: string };
    const otherProps = otherCheckbox.props as { disabled?: boolean; label: string };
    expect(selfProps.disabled).toBe(true);
    expect(selfProps.label).toContain(t("admin.users.detail.selfNote"));
    expect(otherProps.disabled).toBe(false);
    expect(otherProps.label).not.toContain(t("admin.users.detail.selfNote"));
  });
});

describe("UsersPage kabı", () => {
  it("varsayılan (dataSource'suz) çağrıldığında ilk render'da iskelet gösterir", () => {
    const html = renderToStaticMarkup(createElement(UsersPage));
    expect(html).toContain(t("admin.users.title"));
    expect(html).toContain('aria-busy="true"');
  });

  it("enjekte edilen kaynakla da ilk render iskelet gösterir; efekt SSR'da çalışmaz", async () => {
    const source = createMockUsersSource(7, 5);
    const html = renderToStaticMarkup(createElement(UsersPage, { dataSource: source }));
    expect(html).toContain('aria-busy="true"');
    // Kaynağın kendisi bağımsız olarak çalışır (determinizm doğrulaması burada değil, üstteki grupta).
    const list = await source.list({});
    expect(list.meta.total).toBe(5);
  });
});

describe("Date.now kullanılmaz", () => {
  it("sentetik üretim gerçek zamanı okumaz (spy hiç çağrılmaz)", () => {
    const spy = vi.spyOn(Date, "now");
    generateSyntheticUsers(69, 100);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
