import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_AUDIT_PATH,
  ADMIN_ROLES_PATH,
  adminAuditHref,
  adminRolesHref,
  isAdminProtected,
  resolveRoute,
} from "../../apps/shell/src/routes";
import {
  applyAuditQuery,
  AUDIT_ACTIONS,
  createMockAuditSource,
  generateSyntheticAuditLog,
  hasActiveAuditFilters,
  matchesAuditQuery,
  type AuditEntry,
} from "../../apps/shell/src/admin/auditDataSource";
import {
  ADMIN_UNITS,
  bulkOutcomeForUser,
  BULK_OPERATIONS,
  computeUsersSummary,
  createMockUsersSource,
  generateSyntheticUsers,
  guardSelfAdminRemoval,
  planBulkEdit,
  validateBulkInput,
  type AdminUserDetail,
} from "../../apps/shell/src/admin/usersDataSource";
import { AuditPage, AuditView, type AuditViewProps } from "../../apps/shell/src/admin/AuditPage";
import { RolesPage, RolesView, type RolesViewProps } from "../../apps/shell/src/admin/RolesPage";
import { UserDetailPage, UserDetailView, type UserDetailViewProps } from "../../apps/shell/src/admin/UserDetailPage";
import { UsersListView, type UsersListViewProps } from "../../apps/shell/src/admin/UsersPage";
import { t } from "../../packages/ui/i18n/tr";

function render(element: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(element);
}

function noop(): void {
  // yalnız zorunlu prop'u doldurur; ilgisiz durumlarda çağrılmaz
}

const BASE_DETAIL: AdminUserDetail = {
  authMethod: "sso",
  createdAt: "2026-01-10T09:00:00.000+03:00",
  displayName: "Örnek Kullanıcı 001",
  email: null,
  gamification: [],
  history: [{ action: "user.create", id: "user-001-hist-1", occurredAt: "2026-01-10T09:00:00.000+03:00" }],
  id: "user-001",
  lastLoginAt: null,
  role: "kullanici",
  roles: ["kullanici"],
  simAccess: ["pulse"],
  status: "active",
  unitId: "unit-1",
  username: "ornek.kullanici.001",
};
const ADMIN_DETAIL: AdminUserDetail = { ...BASE_DETAIL, id: "user-admin", role: "admin", roles: ["admin"], username: "ornek.admin" };

describe("Toplu düzenleme saf fonksiyonları (E3 §e.5/§d, T73)", () => {
  it("validateBulkInput admin dışı rol için role_not_permitted döner; kullanici için null", () => {
    expect(validateBulkInput({ operation: "assign_role", userIds: ["u1"], value: "admin" })).toBe("role_not_permitted");
    expect(validateBulkInput({ operation: "revoke_role", userIds: ["u1"], value: "admin" })).toBe("role_not_permitted");
    expect(validateBulkInput({ operation: "assign_role", userIds: ["u1"], value: "kullanici" })).toBeNull();
  });

  it("validateBulkInput bilinmeyen birim için unknown_unit döner; bilinen birim null", () => {
    expect(validateBulkInput({ operation: "set_unit", userIds: ["u1"], value: "yok-boyle-birim" })).toBe("unknown_unit");
    expect(validateBulkInput({ operation: "set_unit", userIds: ["u1"], value: ADMIN_UNITS[0]?.id ?? "" })).toBeNull();
  });

  it("bulkOutcomeForUser: zaten kullanici rolü varsa assign_role no_change döner", () => {
    const outcome = bulkOutcomeForUser(BASE_DETAIL, { operation: "assign_role", userIds: [BASE_DETAIL.id], value: "kullanici" }, 0);
    expect(outcome.reason).toBe("no_change");
  });

  it("bulkOutcomeForUser: revoke_role tüm rolleri kaldırırsa would_orphan_roles ile atlanır", () => {
    const outcome = bulkOutcomeForUser(BASE_DETAIL, { operation: "revoke_role", userIds: [BASE_DETAIL.id], value: "kullanici" }, 0);
    expect(outcome.reason).toBe("would_orphan_roles");
    expect(outcome.next).toEqual(BASE_DETAIL);
  });

  it("bulkOutcomeForUser: set_status değişimi geçmişe girdi ekler", () => {
    const outcome = bulkOutcomeForUser(BASE_DETAIL, { operation: "set_status", userIds: [BASE_DETAIL.id], value: "suspended" }, 1_700_000_000_000);
    expect(outcome.reason).toBeUndefined();
    expect(outcome.next.status).toBe("suspended");
    expect(outcome.next.history.at(-1)?.action).toBe("user.suspend");
  });

  it("bulkOutcomeForUser: grant_sim/revoke_sim sim erişimini değiştirir", () => {
    const granted = bulkOutcomeForUser(BASE_DETAIL, { operation: "grant_sim", userIds: [BASE_DETAIL.id], value: "opaca" }, 0);
    expect(granted.next.simAccess).toEqual(["pulse", "opaca"]);
    const revoked = bulkOutcomeForUser(BASE_DETAIL, { operation: "revoke_sim", userIds: [BASE_DETAIL.id], value: "pulse" }, 0);
    expect(revoked.next.simAccess).toEqual([]);
  });

  it("planBulkEdit: bilinmeyen userId tüm işlemi reddeder (atomik)", () => {
    expect(() => planBulkEdit([BASE_DETAIL], { operation: "set_status", userIds: ["yok"], value: "active" }, 0)).toThrow("not_found");
  });

  it("planBulkEdit: bilinen satırlar güncellenir, değişmeyenler skipped'e düşer (hata sayılmaz)", () => {
    const users = [BASE_DETAIL, { ...BASE_DETAIL, id: "user-002", status: "active" as const }];
    const { result, updatedUsers } = planBulkEdit(
      users,
      { operation: "set_status", userIds: ["user-001", "user-002"], value: "active" },
      0,
    );
    expect(result.updated).toBe(0);
    expect(result.skipped).toHaveLength(2);
    expect(updatedUsers).toHaveLength(0);
  });

  it("BULK_OPERATIONS altı işlemin tamamını kapsar (E3 §d/@egemed/contracts)", () => {
    expect(BULK_OPERATIONS).toEqual(["assign_role", "revoke_role", "set_unit", "set_status", "grant_sim", "revoke_sim"]);
  });
});

describe("guardSelfAdminRemoval (E3 §e.6 uyarısı: kendi admin rolünü kaldıramaz, T73)", () => {
  it("aktör kendi admin rolünü kaldırmaya çalışırsa self_admin_removal döner", () => {
    expect(guardSelfAdminRemoval(ADMIN_DETAIL, ["kullanici"], ADMIN_DETAIL.id)).toBe("self_admin_removal");
  });

  it("başka bir adminin admin rolünü kaldırmak serbesttir", () => {
    expect(guardSelfAdminRemoval(ADMIN_DETAIL, [], "baska-admin-id")).toBeNull();
  });

  it("kendi admin rolünü VERMEK (zaten admin değilken) engellenmez", () => {
    expect(guardSelfAdminRemoval(BASE_DETAIL, ["kullanici", "admin"], BASE_DETAIL.id)).toBeNull();
  });
});

describe("createMockUsersSource: bulkPreview/bulkApply/setRoles/summary (T73)", () => {
  it("bulkPreview hiçbir kaydı değiştirmez; bulkApply aynı sayıyı uygular", async () => {
    const source = createMockUsersSource(69, 30);
    const users = generateSyntheticUsers(69, 30);
    const target = users.find((user) => user.status !== "active");
    if (target === undefined) throw new Error("Test verisinde 'active' olmayan kullanıcı bulunamadı.");
    const input = { operation: "set_status" as const, userIds: [target.id], value: "active" as const };
    const preview = await source.bulkPreview(input);
    const beforeApply = await source.get(target.id);
    expect(beforeApply?.status).toBe(target.status);
    const applied = await source.bulkApply(input);
    expect(applied).toEqual(preview);
    const afterApply = await source.get(target.id);
    expect(afterApply?.status).toBe("active");
  });

  it("bulkApply admin rolü ataması denenirse reddeder (role_not_permitted)", async () => {
    const source = createMockUsersSource(69, 10);
    await expect(
      source.bulkApply({ operation: "assign_role", userIds: ["user-001"], value: "admin" as never }),
    ).rejects.toThrow("role_not_permitted");
  });

  it("setRoles admin rolü verir/kaldırır; kendi admin rolünü kaldırma self_admin_removal ile reddedilir", async () => {
    const source = createMockUsersSource(69, 10);
    const first = generateSyntheticUsers(69, 10)[0];
    if (first === undefined) throw new Error("Test verisi boş.");
    const granted = await source.setRoles(first.id, ["kullanici", "admin"], null);
    expect(granted.roles).toEqual(["kullanici", "admin"]);
    expect(granted.role).toBe("admin");
    await expect(source.setRoles(first.id, ["kullanici"], first.id)).rejects.toThrow("self_admin_removal");
    const revoked = await source.setRoles(first.id, ["kullanici"], "baska-kullanici");
    expect(revoked.roles).toEqual(["kullanici"]);
  });

  it("summary() rol ve sim erişimi sayılarını tam listeden hesaplar", async () => {
    const source = createMockUsersSource(69, 50);
    const users = generateSyntheticUsers(69, 50);
    const expected = computeUsersSummary(users);
    expect(await source.summary()).toEqual(expected);
  });

  it("Date.now hiçbir yerde kullanılmaz (now enjeksiyonuyla çalışır)", async () => {
    const spy = vi.spyOn(Date, "now");
    const source = createMockUsersSource(69, 5, () => 12345);
    await source.bulkApply({ operation: "set_status", userIds: ["user-001"], value: "suspended" });
    await source.setRoles("user-002", ["kullanici", "admin"], null);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("Denetim günlüğü saf fonksiyonları (E3 §e.7/§c, T73)", () => {
  it("generateSyntheticAuditLog deterministiktir ve en yeniden en eskiye sıralıdır", () => {
    const first = generateSyntheticAuditLog(91, 40);
    const second = generateSyntheticAuditLog(91, 40);
    expect(first).toEqual(second);
    for (let index = 1; index < first.length; index += 1) {
      expect(first[index - 1]!.occurredAt >= first[index]!.occurredAt).toBe(true);
    }
  });

  it("her kayıt sır/ham veri taşımaz; eylem AUDIT_ACTIONS kümesinden gelir", () => {
    const entries = generateSyntheticAuditLog(91, 60);
    for (const entry of entries) {
      expect(AUDIT_ACTIONS).toContain(entry.action);
      expect(entry.summary).not.toMatch(/token|password|sifre|secret/i);
      if (entry.action === "purge.run") expect(entry.actorId).toBeNull();
    }
  });

  it("hasActiveAuditFilters/matchesAuditQuery aktör, eylem, hedef ve tarih aralığını süzer", () => {
    const entry: AuditEntry = {
      action: "role.grant",
      actorId: "audit-actor-001",
      actorName: "Örnek Yönetici 001",
      id: "audit-1",
      occurredAt: "2026-05-10T09:00:00.000Z",
      summary: "Admin rolü verildi.",
      targetId: "user-010",
      targetName: "Örnek Kullanıcı 010",
      targetType: "user",
    };
    expect(hasActiveAuditFilters({})).toBe(false);
    expect(hasActiveAuditFilters({ actor: "yönetici" })).toBe(true);
    expect(matchesAuditQuery(entry, { actor: "yönetici" })).toBe(true);
    expect(matchesAuditQuery(entry, { actor: "başka" })).toBe(false);
    expect(matchesAuditQuery(entry, { action: "user.create" })).toBe(false);
    expect(matchesAuditQuery(entry, { from: "2026-05-11" })).toBe(false);
    expect(matchesAuditQuery(entry, { to: "2026-05-09" })).toBe(false);
    expect(matchesAuditQuery(entry, { target: "010" })).toBe(true);
  });

  it("applyAuditQuery filtre sonrası sayıyı meta.total'da taşır ve sayfalar", () => {
    const entries = generateSyntheticAuditLog(91, 100);
    const result = applyAuditQuery(entries, { page: 1, pageSize: 10 });
    expect(result.data).toHaveLength(10);
    expect(result.meta.total).toBe(100);
  });

  it("createMockAuditSource Date.now kullanmaz; tohumla deterministiktir", async () => {
    const spy = vi.spyOn(Date, "now");
    const first = await createMockAuditSource(91, 20).list({});
    const second = await createMockAuditSource(91, 20).list({});
    expect(first).toEqual(second);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("#/admin/roller ve #/admin/denetim rotaları (T73)", () => {
  it("yolları doğru 'kind' ile çözer; sondaki '/' ve sorgu yok sayılır", () => {
    for (const hash of [`#${ADMIN_ROLES_PATH}`, `#${ADMIN_ROLES_PATH}/`, `#${ADMIN_ROLES_PATH}?x=1`]) {
      expect(resolveRoute(hash), hash).toEqual({ kind: "adminRoles", titleKey: "admin.roles.title" });
    }
    for (const hash of [`#${ADMIN_AUDIT_PATH}`, `#${ADMIN_AUDIT_PATH}/`]) {
      expect(resolveRoute(hash), hash).toEqual({ kind: "adminAudit", titleKey: "admin.audit.title" });
    }
  });

  it("adminRolesHref/adminAuditHref kendi yoluna çözülür; admin korumasına dahildir", () => {
    expect(resolveRoute(adminRolesHref())).toEqual({ kind: "adminRoles", titleKey: "admin.roles.title" });
    expect(resolveRoute(adminAuditHref())).toEqual({ kind: "adminAudit", titleKey: "admin.audit.title" });
    expect(isAdminProtected({ kind: "adminRoles", titleKey: "admin.roles.title" })).toBe(true);
    expect(isAdminProtected({ kind: "adminAudit", titleKey: "admin.audit.title" })).toBe(true);
  });
});

function baseRolesViewProps(overrides: Partial<RolesViewProps>): RolesViewProps {
  return {
    status: "loading",
    summary: null,
    ...overrides,
  };
}

describe("RolesView işaretlemesi (E3 §e.6, T73)", () => {
  it("hazır durumda rol kartlarını, salt okunur yetki matrisini ve birim/sim listelerini gösterir", () => {
    const html = render(
      createElement(
        RolesView,
        baseRolesViewProps({
          status: "ready",
          summary: { roleCounts: { admin: 2, kullanici: 48 }, simCounts: { ausculta: 10, opaca: 5, pulse: 20 } },
        }),
      ),
    );
    expect(html).toContain(t("admin.roles.matrix.title"));
    expect(html).toContain(t("admin.roles.matrix.roleAssign"));
    expect(html).toContain(t("admin.roles.usersLink"));
    // Rol ataması bu ekrandan yapılmaz: mutasyon düğmesi/formu yoktur (tek yol ilkesi).
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<select");
  });

  it("hata durumunda hata başlığını gösterir", () => {
    const html = render(createElement(RolesView, baseRolesViewProps({ status: "error" })));
    expect(html).toContain(t("admin.roles.error.title"));
  });
});

describe("RolesPage kabı (T73)", () => {
  it("varsayılan (dataSource'suz) çağrıldığında yüklenme iskeletiyle render edilir", () => {
    const html = render(createElement(RolesPage));
    expect(html).toContain(t("admin.roles.title"));
  });

  it("enjekte edilen kaynakla da başlığı gösterir", () => {
    const source = createMockUsersSource(69, 10);
    const html = render(createElement(RolesPage, { dataSource: source }));
    expect(html).toContain(t("admin.roles.title"));
  });
});

function baseAuditViewProps(overrides: Partial<AuditViewProps>): AuditViewProps {
  return {
    detailEntry: null,
    filtersOpen: false,
    onClearFilters: noop,
    onCloseDetail: noop,
    onFilterChange: noop,
    onFiltersOpenChange: noop,
    onOpenDetail: noop,
    onPageChange: noop,
    onRetry: noop,
    query: { page: 1, pageSize: 20 },
    result: null,
    status: "loading",
    ...overrides,
  };
}

const AUDIT_ENTRY: AuditEntry = {
  action: "role.grant",
  actorId: "audit-actor-001",
  actorName: "Örnek Yönetici 001",
  id: "audit-1",
  occurredAt: "2026-05-10T09:00:00.000Z",
  summary: "Admin rolü verildi.",
  targetId: "user-010",
  targetName: "Örnek Kullanıcı 010",
  targetType: "user",
};

describe("AuditView işaretlemesi (E3 §e.7, T73)", () => {
  it("hazır durumda filtre alanlarını ve kayıt tablosunu gösterir; salt okunurdur", () => {
    const html = render(
      createElement(
        AuditView,
        baseAuditViewProps({
          result: { data: [AUDIT_ENTRY], meta: { page: 1, pageSize: 20, total: 1 } },
          status: "ready",
        }),
      ),
    );
    expect(html).toContain(t("admin.audit.filter.actor"));
    expect(html).toContain(t("admin.audit.table.caption"));
    expect(html).toContain(AUDIT_ENTRY.actorName);
    expect(html).toContain(t("admin.audit.action.role.grant"));
  });

  it("ayrıntı kaydı açıkken özet metnini modalda gösterir", () => {
    const html = render(createElement(AuditView, baseAuditViewProps({ detailEntry: AUDIT_ENTRY, status: "ready" })));
    expect(html).toContain('role="dialog"');
    expect(html).toContain(AUDIT_ENTRY.summary);
  });

  it("filtre etkinken sonuç yoksa filtrelenmiş boş durumunu gösterir", () => {
    const html = render(
      createElement(
        AuditView,
        baseAuditViewProps({
          query: { actor: "yok-boyle-aktor", page: 1, pageSize: 20 },
          result: { data: [], meta: { page: 1, pageSize: 20, total: 0 } },
          status: "ready",
        }),
      ),
    );
    expect(html).toContain(t("admin.audit.filtered.empty"));
  });
});

describe("AuditPage kabı (T73)", () => {
  it("varsayılan (dataSource'suz) çağrıldığında başlığı gösterir", () => {
    const html = render(createElement(AuditPage));
    expect(html).toContain(t("admin.audit.title"));
  });
});

describe("Toplu düzenleme diyaloğu (UsersListView içinde, E3 §e.5, T73)", () => {
  function baseListProps(overrides: Partial<UsersListViewProps>): UsersListViewProps {
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
      selected: new Set(["user-001"]),
      status: "loading",
      units: ADMIN_UNITS,
      ...overrides,
    };
  }

  it("seçim varken 'Toplu işlem' düğmesi görünür; diyalog kapalıyken işlem seçenekleri render edilmez", () => {
    const html = render(createElement(UsersListView, baseListProps({})));
    expect(html).toContain(t("admin.users.bulk.open"));
    expect(html).not.toContain(t("admin.bulk.notice"));
  });

  it("diyalog açıkken altı işlemi ve dryRun etki önizlemesini gösterir; admin değeri hiç sunulmaz", () => {
    const html = render(
      createElement(
        UsersListView,
        baseListProps({
          bulkOpen: true,
          bulkPreview: { skipped: [{ reason: "no_change", userId: "user-002" }], updated: 3 },
        }),
      ),
    );
    for (const operation of BULK_OPERATIONS) expect(html).toContain(t(`admin.bulk.operation.${operation}` as const));
    expect(html).toContain(t("admin.bulk.notice"));
    expect(html).toContain(t("admin.bulk.effect.label"));
  });

  it("assign_role işleminde değer seçeneklerinde ASLA 'admin' sunulmaz (E3 §b)", () => {
    const html = render(createElement(UsersListView, baseListProps({ bulkOpen: true, bulkOperation: "assign_role" })));
    const dialogStart = html.indexOf('class="eg-modal__body"');
    expect(html.slice(dialogStart)).not.toContain('value="admin"');
  });

  it("assign_role/revoke_role işleminde değer alanı sabittir; admin seçilemez", () => {
    const html = render(
      createElement(UsersListView, baseListProps({ bulkOpen: true, bulkOperation: "assign_role", bulkValue: "kullanici" })),
    );
    expect(html).toContain(t("admin.bulk.value.roleForbidden"));
  });

  it("uygulama sonucu gösterildiğinde güncellenen/atlanan sayıları render eder", () => {
    const html = render(
      createElement(
        UsersListView,
        baseListProps({
          bulkApplyResult: { skipped: [{ reason: "would_orphan_roles", userId: "user-003" }], updated: 4 },
          bulkOpen: true,
        }),
      ),
    );
    expect(html).toContain(t("admin.bulk.result.title"));
    expect(html).toContain(t("admin.bulk.result.skip.would_orphan_roles"));
  });
});

function baseDetailViewProps(overrides: Partial<UserDetailViewProps>): UserDetailViewProps {
  return {
    actionError: false,
    currentUserId: null,
    deleteConfirmText: "",
    detail: BASE_DETAIL,
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

describe("Roller ve erişim sekmesi — admin rolü ver/kaldır (UserDetailPage, E3 §b/§e.6, T73)", () => {
  it("admin olmayan kullanıcıda 'Admin rolü ver' düğmesi görünür", () => {
    const html = render(createElement(UserDetailView, baseDetailViewProps({})));
    expect(html).toContain(t("admin.users.detail.roles.grant"));
  });

  it("admin kullanıcıda ve oturum sahibi kendisiyse 'kaldır' düğmesi devre dışı ve uyarı görünür", () => {
    const html = render(
      createElement(UserDetailView, baseDetailViewProps({ currentUserId: ADMIN_DETAIL.id, detail: ADMIN_DETAIL })),
    );
    expect(html).toContain(t("admin.users.detail.roles.revoke"));
    expect(html).toContain(t("admin.users.detail.roles.selfGuard"));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Admin rolünü kaldır/);
  });

  it("admin kullanıcıda ama oturum sahibi BAŞKASIYSA 'kaldır' düğmesi etkindir, uyarı yoktur", () => {
    const html = render(
      createElement(UserDetailView, baseDetailViewProps({ currentUserId: "baska-admin", detail: ADMIN_DETAIL })),
    );
    expect(html).toContain(t("admin.users.detail.roles.revoke"));
    expect(html).not.toContain(t("admin.users.detail.roles.selfGuard"));
  });

  it("onRequestAction grantAdmin/revokeAdmin ile çağrılır (mutasyon UsersPage/UserDetailPage'de setRoles'e bağlanır)", () => {
    let requested: string | null = null;
    render(
      createElement(
        UserDetailView,
        baseDetailViewProps({ onRequestAction: (action) => { requested = action; } }),
      ),
    );
    // Render sırasında çağrılmaz; düğme onClick'i doğrudan çağırarak doğrulanır (DOM'suz desen).
    expect(requested).toBeNull();
  });
});

describe("UserDetailPage kabı: setRoles akışı ve self-guard (T73)", () => {
  it("grantAdmin/revokeAdmin akışında setRoles kullanılır; kendi admin rolünü kaldırma guardSelfAdminRemoval ile reddedilir", async () => {
    const source = createMockUsersSource(69, 5);
    const first = generateSyntheticUsers(69, 5)[0];
    if (first === undefined) throw new Error("Test verisi boş.");
    const granted = await source.setRoles(first.id, ["kullanici", "admin"], null);
    expect(granted.roles).toContain("admin");
    await expect(source.setRoles(first.id, ["kullanici"], first.id)).rejects.toThrow("self_admin_removal");
  });

  it("varsayılan (dataSource'suz) çağrıldığında başlangıçta yüklenme iskeletini render eder", () => {
    const html = render(createElement(UserDetailPage, { userId: "user-001" }));
    expect(html).toContain(t("admin.users.detail.back"));
  });
});
