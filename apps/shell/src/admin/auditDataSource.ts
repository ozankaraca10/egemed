/**
 * Denetim günlüğü (T73, E3 §e.7) için DOM'suz veri katmanı: deterministik,
 * tohumlu sentetik `AuditEntry` listesi + saf filtre/sayfalama fonksiyonları.
 *
 * `apps/api` henüz `GET /admin/audit` sunmaz (E3 §d); ekran veriyi bu
 * `AuditDataSource` arayüzü üzerinden enjekte alır (`usersDataSource.ts`
 * deseniyle aynı). Kayıtlar salt okunur ve sır/ham veri taşımaz (E3 §c
 * `audit_log.summary_before/after`: yalnız özet). Gerçek kişi adı yerine
 * "Örnek Yönetici NNN" / "Örnek Kullanıcı NNN" biçiminde sentetik adlar
 * kullanılır (AGENTS.md: mock veri deterministik tohumlu).
 */

import { clampPage, clampPageSize, mulberry32 } from "./usersDataSource";

/** `audit_log.action` alt kümesi (E3 §c örnek değerleri: user.*, role.*, import.apply, purge.run). */
export type AuditAction =
  | "user.create"
  | "user.suspend"
  | "user.activate"
  | "user.delete"
  | "role.grant"
  | "role.revoke"
  | "import.apply"
  | "purge.run";

export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "user.create",
  "user.suspend",
  "user.activate",
  "user.delete",
  "role.grant",
  "role.revoke",
  "import.apply",
  "purge.run",
];

export type AuditTargetType = "user" | "import_batch";

export interface AuditEntry {
  readonly id: string;
  readonly occurredAt: string;
  /** Sistem işlerinde (ör. `purge.run`) `null` (E3 §c). */
  readonly actorId: string | null;
  /** Görüntülenen ad; sistem işinde "Sistem". */
  readonly actorName: string;
  readonly action: AuditAction;
  readonly targetType: AuditTargetType | null;
  readonly targetId: string | null;
  readonly targetName: string | null;
  /** Kısa, kodlu özet; sır/oturum belirteci/ham yanıt taşımaz (E3 §c). */
  readonly summary: string;
}

export interface AuditListQuery {
  readonly actor?: string | undefined;
  readonly action?: AuditAction | undefined;
  readonly target?: string | undefined;
  /** "YYYY-MM-DD" biçiminde, dahil. */
  readonly from?: string | undefined;
  /** "YYYY-MM-DD" biçiminde, dahil. */
  readonly to?: string | undefined;
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface AuditListMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface AuditListResult {
  readonly data: readonly AuditEntry[];
  readonly meta: AuditListMeta;
}

/** Aktör/eylem/hedef/tarih filtrelerinden biri etkinse `true` (E3 §e.7 filtre çubuğu). */
export function hasActiveAuditFilters(query: AuditListQuery): boolean {
  return (
    (query.actor?.trim().length ?? 0) > 0 ||
    query.action !== undefined ||
    (query.target?.trim().length ?? 0) > 0 ||
    (query.from?.length ?? 0) > 0 ||
    (query.to?.length ?? 0) > 0
  );
}

/** Tek kaydın sorguyla eşleşip eşleşmediğini saf olarak değerlendirir. */
export function matchesAuditQuery(entry: AuditEntry, query: AuditListQuery): boolean {
  if (query.action !== undefined && entry.action !== query.action) return false;
  const actorNeedle = query.actor?.trim().toLowerCase();
  if (actorNeedle !== undefined && actorNeedle.length > 0 && !entry.actorName.toLowerCase().includes(actorNeedle)) return false;
  const targetNeedle = query.target?.trim().toLowerCase();
  if (targetNeedle !== undefined && targetNeedle.length > 0 && !(entry.targetName ?? "").toLowerCase().includes(targetNeedle)) {
    return false;
  }
  const day = entry.occurredAt.slice(0, 10);
  if (query.from !== undefined && query.from.length > 0 && day < query.from) return false;
  if (query.to !== undefined && query.to.length > 0 && day > query.to) return false;
  return true;
}

/** Filtre → sayfalama; kayıtlar zaten yeniden eskiye üretildiği için yeniden sıralanmaz. */
export function applyAuditQuery(entries: readonly AuditEntry[], query: AuditListQuery): AuditListResult {
  const filtered = entries.filter((entry) => matchesAuditQuery(entry, query));
  const pageSize = clampPageSize(query.pageSize);
  const page = clampPage(query.page);
  const start = (page - 1) * pageSize;
  return { data: filtered.slice(start, start + pageSize), meta: { page, pageSize, total: filtered.length } };
}

/** Sır/ham veri taşımayan, kısa kodlu özet (E3 §c: `summary_before/after` yalnız özet). */
const AUDIT_SUMMARY_BY_ACTION: Readonly<Record<AuditAction, string>> = {
  "import.apply": "Toplu içe aktarma uygulandı.",
  "purge.run": "İmha işi çalıştı: süresi geçen kayıtlar temizlendi.",
  "role.grant": "Admin rolü verildi.",
  "role.revoke": "Admin rolü kaldırıldı.",
  "user.activate": "Kullanıcı etkinleştirildi.",
  "user.create": "Kullanıcı oluşturuldu.",
  "user.delete": "Kullanıcı silindi.",
  "user.suspend": "Kullanıcı askıya alındı.",
};

const AUDIT_EPOCH_MS = Date.parse("2026-09-23T14:05:00.000+03:00");
const MINUTE_MS = 60_000;
const AUDIT_WINDOW_MINUTES = 60 * 24 * 45; // 45 gün içinde dağıtılır

function pickAction(rng: () => number): AuditAction {
  const index = Math.min(AUDIT_ACTIONS.length - 1, Math.floor(rng() * AUDIT_ACTIONS.length));
  const action = AUDIT_ACTIONS[index];
  if (action === undefined) throw new Error("Boş eylem havuzundan seçim yapılamaz.");
  return action;
}

function pad3(value: number): string {
  return String(value).padStart(3, "0");
}

/**
 * Deterministik sentetik denetim günlüğü üretir; gerçek kişi/kurum verisi
 * taşımaz. `Date.now()` KULLANILMAZ (AGENTS.md) — sabit `AUDIT_EPOCH_MS` +
 * tohumlu rastgele ofsetten türer. Sonuç en yeniden en eskiye sıralıdır.
 */
export function generateSyntheticAuditLog(seed: number, count: number): AuditEntry[] {
  const rng = mulberry32(seed);
  const entries: AuditEntry[] = [];
  for (let index = 1; index <= count; index += 1) {
    const action = pickAction(rng);
    const isSystem = action === "purge.run";
    const actorNumber = 1 + Math.floor(rng() * 6);
    const actorId = isSystem ? null : `audit-actor-${pad3(actorNumber)}`;
    const actorName = isSystem ? "Sistem" : `Örnek Yönetici ${pad3(actorNumber)}`;
    const targetType: AuditTargetType | null = isSystem ? null : action.startsWith("import.") ? "import_batch" : "user";
    const targetNumber = 1 + Math.floor(rng() * 240);
    const targetId = targetType === null ? null : targetType === "user" ? `user-${pad3(targetNumber)}` : `import-${targetNumber}`;
    const targetName =
      targetType === "user" ? `Örnek Kullanıcı ${pad3(targetNumber)}` : targetType === "import_batch" ? `İçe aktarma #${targetNumber}` : null;
    const offsetMinutes = Math.floor(rng() * AUDIT_WINDOW_MINUTES);
    const occurredAt = new Date(AUDIT_EPOCH_MS - offsetMinutes * MINUTE_MS).toISOString();
    entries.push({
      action,
      actorId,
      actorName,
      id: `audit-${index}`,
      occurredAt,
      summary: AUDIT_SUMMARY_BY_ACTION[action],
      targetId,
      targetName,
      targetType,
    });
  }
  return entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export interface AuditDataSource {
  list(query: AuditListQuery): Promise<AuditListResult>;
}

const DEFAULT_AUDIT_SEED = 91;
const DEFAULT_AUDIT_SIZE = 140;

/** Sentetik, tohumlu `AuditDataSource`; API bağlanana dek `AuditPage` bunu kullanır. */
export function createMockAuditSource(seed: number = DEFAULT_AUDIT_SEED, size: number = DEFAULT_AUDIT_SIZE): AuditDataSource {
  const entries = generateSyntheticAuditLog(seed, size);
  return {
    list(query: AuditListQuery): Promise<AuditListResult> {
      return Promise.resolve(applyAuditQuery(entries, query));
    },
  };
}
