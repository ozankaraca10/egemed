import ts from "typescript";
import { describe, expect, it } from "vitest";

// T61 — E3 §c şemasının statik sözleşmesi (DB gerektirmez). Gerçek up→down→up
// turu `pnpm --filter @egemed/api test:db` ile yerel PostgreSQL'de çalışır ve CI
// kapısına eklenmez. SQL dosyaları node-pg-migrate'in düz SQL biçimindedir:
// "-- Up Migration" ve "-- Down Migration" işaretleriyle iki bölüm.

const migrationsDir = "apps/api/migrations";

function read(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) {
    throw new Error(`Dosya okunamadı: ${path}`);
  }
  return content;
}

/** SQL yorumlarını (-- ...) kaldırır; yalnız çalıştırılabilir ifade kalır. */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

const upMarker = /^\s*--[\s-]*up\s+migration.*$/im;
const downMarker = /^\s*--[\s-]*down\s+migration.*$/im;

const migrations = ts.sys
  .readDirectory(migrationsDir, [".sql"])
  .sort()
  .map((path) => {
    const content = read(path);
    const upIndex = content.search(upMarker);
    const downIndex = content.search(downMarker);
    if (upIndex < 0 || downIndex < 0 || downIndex < upIndex) {
      throw new Error(`${path}: Up/Down işaretleri eksik veya sırasız`);
    }
    return { path, content, up: content.slice(upIndex, downIndex), down: content.slice(downIndex) };
  });

const allUp = stripComments(migrations.map((migration) => migration.up).join("\n"));
const allDown = stripComments(migrations.map((migration) => migration.down).join("\n"));

function tableBlock(table: string): string {
  const match = new RegExp(`create table ${table} \\(([\\s\\S]*?)\\n\\);`).exec(allUp);
  if (match === null) {
    throw new Error(`create table bulunamadı: ${table}`);
  }
  return match[1] ?? "";
}

/** Tablo gövdesindeki kolon adlarını sırayla döndürür (constraint satırları hariç). */
function columnNames(table: string): string[] {
  return tableBlock(table)
    .split("\n")
    .filter((line) => !line.startsWith("  constraint "))
    .map((line) => /^ {2}([a-z_][a-z0-9_]*)\s/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined);
}

/** Bir CHECK kısıtındaki tırnaklı değerleri sıralı döndürür. */
function checkValues(constraint: string): string[] {
  const match = new RegExp(`${constraint} check \\(\\s*[a-z_]+\\s+in\\s*\\(([^)]*)\\)`).exec(allUp);
  if (match === null) {
    throw new Error(`CHECK kısıtı bulunamadı: ${constraint}`);
  }
  return [...(match[1] ?? "").matchAll(/'([^']+)'/g)].map((value) => value[1] ?? "").sort();
}

const expectedColumns: Record<string, readonly string[]> = {
  institutions: ["id", "code", "name", "status", "created_at", "updated_at", "deleted_at"],
  units: ["id", "institution_id", "parent_id", "code", "name", "created_at", "updated_at", "deleted_at"],
  users: [
    "id",
    "institution_id",
    "unit_id",
    "username",
    "email",
    "display_name",
    "auth_method",
    "sso_subject",
    "status",
    "xapi_actor_id",
    "created_at",
    "updated_at",
    "last_login_at",
    "deleted_at",
  ],
  user_roles: ["id", "user_id", "role", "granted_by", "granted_at"],
  sim_access: ["id", "user_id", "sim_id", "granted_by", "granted_at"],
  sessions: ["id", "user_id", "auth_method", "created_at", "last_seen_at", "expires_at", "revoked_at"],
  import_batches: [
    "id",
    "institution_id",
    "uploaded_by",
    "file_name",
    "mode",
    "status",
    "template_version",
    "row_count",
    "valid_count",
    "error_count",
    "applied_count",
    "created_at",
    "validated_at",
    "applied_at",
    "expires_at",
  ],
  import_rows: [
    "id",
    "batch_id",
    "row_no",
    "raw",
    "normalized",
    "status",
    "errors",
    "matched_user_id",
    "created_at",
    "applied_at",
  ],
  audit_log: [
    "id",
    "occurred_at",
    "actor_user_id",
    "actor_role",
    "institution_id",
    "action",
    "target_type",
    "target_id",
    "summary_before",
    "summary_after",
    "request_id",
  ],
  gami_profiles: [
    "user_id",
    "sim_id",
    "xp",
    "level",
    "streak_current",
    "streak_best",
    "streak_last_date",
    "updated_at",
  ],
  gami_badges: ["id", "user_id", "sim_id", "badge_key", "awarded_at"],
  gami_attempts: [
    "id",
    "user_id",
    "sim_id",
    "attempt_no",
    "started_at",
    "finished_at",
    "score",
    "max_score",
    "passed",
    "summary",
    "created_at",
  ],
};

const expectedConstraints = [
  "constraint institutions_code_format_check check (code ~ '^[a-z0-9][a-z0-9-]{1,31}$')",
  "constraint institutions_name_length_check check (char_length(name) between 2 and 200)",
  "constraint institutions_status_check check (status in ('active', 'archived'))",
  "constraint institutions_code_key unique (code)",
  "constraint units_institution_id_fkey foreign key (institution_id) references institutions (id) on delete restrict",
  "constraint units_parent_id_fkey foreign key (parent_id) references units (id) on delete restrict",
  "constraint units_code_format_check check (code ~ '^[a-z0-9][a-z0-9-]{0,31}$')",
  "constraint units_name_length_check check (char_length(name) between 2 and 200)",
  "constraint users_username_format_check check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,63}$')",
  "constraint users_display_name_length_check check (char_length(display_name) between 2 and 120)",
  "constraint users_auth_method_check check (auth_method in ('sso', 'dev'))",
  "constraint users_status_check check (status in ('invited', 'active', 'suspended', 'deleted'))",
  "constraint users_xapi_actor_id_format_check check (xapi_actor_id ~ '^[A-Za-z0-9._:-]{8,128}$')",
  "constraint users_mapping_key_check check (username is not null or email is not null)",
  "constraint users_deleted_at_check check (status <> 'deleted' or deleted_at is not null)",
  "constraint users_xapi_actor_id_key unique (xapi_actor_id)",
  "constraint user_roles_user_id_fkey foreign key (user_id) references users (id) on delete cascade",
  "constraint user_roles_role_check check (role in ('admin', 'kullanici'))",
  "constraint user_roles_user_role_key unique (user_id, role)",
  "constraint sim_access_user_id_fkey foreign key (user_id) references users (id) on delete cascade",
  "constraint sim_access_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca'))",
  "constraint sim_access_user_sim_key unique (user_id, sim_id)",
  "constraint sessions_user_id_fkey foreign key (user_id) references users (id) on delete cascade",
  "constraint sessions_auth_method_check check (auth_method in ('sso', 'dev'))",
  "constraint import_batches_file_name_length_check check (char_length(file_name) between 1 and 200)",
  "constraint import_batches_mode_check check (mode in ('ekle', 'guncelle'))",
  "constraint import_batches_status_check check (status in ('uploaded', 'validated', 'applied', 'failed', 'expired'))",
  "constraint import_rows_batch_id_fkey foreign key (batch_id) references import_batches (id) on delete cascade",
  "constraint import_rows_status_check check (status in ('valid', 'error', 'applied', 'skipped'))",
  "constraint import_rows_batch_row_key unique (batch_id, row_no)",
  "constraint gami_profiles_user_id_fkey foreign key (user_id) references users (id) on delete cascade",
  "constraint gami_profiles_pkey primary key (user_id, sim_id)",
  "constraint gami_profiles_xp_check check (xp >= 0)",
  "constraint gami_profiles_level_check check (level >= 1)",
  "constraint gami_badges_profile_fkey foreign key (user_id, sim_id) references gami_profiles (user_id, sim_id) on delete cascade",
  "constraint gami_badges_badge_key_format_check check (badge_key ~ '^[a-z0-9][a-z0-9-]{0,63}$')",
  "constraint gami_badges_user_sim_badge_key unique (user_id, sim_id, badge_key)",
  "constraint gami_attempts_user_id_fkey foreign key (user_id) references users (id) on delete cascade",
  "constraint gami_attempts_attempt_no_check check (attempt_no > 0)",
  "constraint gami_attempts_score_check check (score <= max_score)",
  "constraint gami_attempts_score_nonnegative_check check (score >= 0)",
  "constraint gami_attempts_max_score_positive_check check (max_score > 0)",
  "constraint gami_attempts_user_sim_attempt_key unique (user_id, sim_id, attempt_no)",
] as const;

const expectedIndexes = [
  "create index institutions_status_idx on institutions (status)",
  "create unique index units_institution_code_key on units (institution_id, code) where deleted_at is null",
  "create index units_institution_parent_idx on units (institution_id, parent_id)",
  "create unique index users_institution_username_key on users (institution_id, lower(username)) where deleted_at is null",
  "create unique index users_institution_email_key on users (institution_id, lower(email)) where deleted_at is null",
  "create unique index users_institution_sso_subject_key on users (institution_id, sso_subject) where sso_subject is not null",
  "create index users_institution_status_idx on users (institution_id, status)",
  "create index users_institution_unit_idx on users (institution_id, unit_id)",
  "create index users_last_login_at_idx on users (last_login_at)",
  "create index user_roles_user_id_idx on user_roles (user_id)",
  "create index user_roles_role_idx on user_roles (role)",
  "create index sessions_user_id_idx on sessions (user_id)",
  "create index sessions_expires_at_idx on sessions (expires_at)",
  "create index import_batches_institution_created_idx on import_batches (institution_id, created_at desc)",
  "create index import_batches_status_expires_idx on import_batches (status, expires_at)",
  "create index import_rows_batch_status_idx on import_rows (batch_id, status)",
  "create index audit_log_institution_occurred_idx on audit_log (institution_id, occurred_at desc)",
  "create index audit_log_target_idx on audit_log (target_type, target_id, occurred_at desc)",
  "create index audit_log_actor_idx on audit_log (actor_user_id, occurred_at desc)",
  "create index gami_profiles_sim_xp_idx on gami_profiles (sim_id, xp desc)",
  "create index gami_attempts_user_sim_finished_idx on gami_attempts (user_id, sim_id, finished_at desc)",
] as const;

describe("migration dosyaları", () => {
  it("düz SQL biçiminde Up/Down bölümleri taşır", () => {
    expect(migrations.length).toBeGreaterThan(0);
    for (const migration of migrations) {
      expect(migration.up.trim(), migration.path).not.toBe("");
      expect(migration.down.trim(), migration.path).not.toBe("");
    }
  });

  it("native enum kullanmaz; kimliği gen_random_uuid() ile üretir", () => {
    expect(allUp).not.toMatch(/create type\b/i);
    expect(allUp).toContain("gen_random_uuid()");
    expect(allUp).not.toMatch(/\btimestamp\b/);
  });

  it("tohum veri içermez, parola ve ifade tutmaz", () => {
    expect(allUp).not.toMatch(/insert into/i);
    expect(allUp).not.toMatch(/password|parola/i);
  });
});

describe("tablolar ve kolonlar", () => {
  it("E3 §c'deki tam tablo kümesini tanımlar", () => {
    const tables = [...allUp.matchAll(/create table ([a-z_][a-z0-9_]*)/g)].map((match) => match[1] ?? "");
    expect(tables.sort()).toEqual(Object.keys(expectedColumns).sort());
  });

  for (const [table, columns] of Object.entries(expectedColumns)) {
    it(`${table} beklenen kolonları taşır`, () => {
      expect(columnNames(table).sort()).toEqual([...columns].sort());
    });
  }
});

describe("kısıtlar", () => {
  it("rol CHECK'i yalnız admin ve kullanici içerir", () => {
    const roleChecks = [...allUp.matchAll(/check \(\s*role\s+in \(([^)]*)\)/g)];
    expect(roleChecks).toHaveLength(1);
    expect(checkValues("constraint user_roles_role_check")).toEqual(["admin", "kullanici"]);
    expect(allUp).not.toMatch(/platform_admin|kurum_admin|egitmen|denetci/i);
  });

  it("her sim_id CHECK'i tam olarak üç simi içerir", () => {
    const simChecks = [...allUp.matchAll(/check \(\s*sim_id\s+in \(([^)]*)\)/g)];
    expect(simChecks).toHaveLength(3);
    for (const check of simChecks) {
      const values = [...(check[1] ?? "").matchAll(/'([^']+)'/g)].map((value) => value[1] ?? "").sort();
      expect(values).toEqual(["ausculta", "opaca", "pulse"]);
    }
  });

  it("gami_attempts puan sınırlarını CHECK ile korur (null serbest)", () => {
    expect(allUp).toContain("constraint gami_attempts_score_nonnegative_check check (score >= 0)");
    expect(allUp).toContain("constraint gami_attempts_max_score_positive_check check (max_score > 0)");
  });

  it("beklenen kısıt tanımlarını taşır", () => {
    for (const constraint of expectedConstraints) {
      expect(allUp, constraint).toContain(constraint);
    }
  });

  it("audit_log append-only'dir; yetki notu ve DB tetikleyicisi", () => {
    const audit = migrations.find((migration) => migration.up.includes("create table audit_log"));
    expect(audit).toBeDefined();
    expect(audit?.content).toMatch(/append-only/i);
    expect(audit?.content).toMatch(/UPDATE/);
    expect(audit?.content).toMatch(/DELETE/);
    expect(allUp).not.toMatch(/\bgrant\b[^;]*\b(update|delete)\b/i);
    expect(tableBlock("audit_log")).toMatch(/generated always as identity primary key/);

    const up = stripComments(audit?.up ?? "");
    const down = stripComments(audit?.down ?? "");
    expect(up).toMatch(/create function audit_log_append_only\(\) returns trigger/i);
    expect(up).toMatch(/create trigger audit_log_append_only\b/i);
    expect(up).toMatch(/before update or delete or truncate on audit_log/i);
    expect(up).toMatch(/for each statement/i);
    expect(up).toMatch(/raise exception 'audit_log append-only'/i);
    expect(up).toMatch(/errcode\s*=\s*'P0010'/i);
    expect(down).toMatch(/drop trigger if exists audit_log_append_only on audit_log/);
    expect(down).toMatch(/drop function if exists audit_log_append_only\(\)/);
  });
});

describe("indeksler", () => {
  it("beklenen indeks tanımlarını taşır", () => {
    for (const index of expectedIndexes) {
      expect(allUp, index).toContain(index);
    }
  });

  it("benzersizlik yalnız yaşayan satırlara uygulanır", () => {
    const partial = [
      "create unique index units_institution_code_key on units (institution_id, code) where deleted_at is null",
      "create unique index users_institution_username_key on users (institution_id, lower(username)) where deleted_at is null",
      "create unique index users_institution_email_key on users (institution_id, lower(email)) where deleted_at is null",
      "create unique index users_institution_sso_subject_key on users (institution_id, sso_subject) where sso_subject is not null",
    ];
    for (const index of partial) {
      expect(allUp, index).toContain(index);
    }
  });
});

describe("gami_leaderboard görünümü", () => {
  const view = /create view gami_leaderboard as([\s\S]*?);/.exec(allUp)?.[1] ?? "";

  it("sim bazında sıralama tanımlar", () => {
    expect(view).toContain("rank() over");
    expect(view).toContain("partition by u.institution_id, p.sim_id");
    expect(view).toContain("order by p.xp desc, p.updated_at asc");
  });

  it("yalnız etkin ve silinmemiş kullanıcıları alır", () => {
    expect(view).toContain("u.status = 'active'");
    expect(view).toContain("u.deleted_at is null");
  });

  it("görünen ad veya eşleme anahtarı taşımaz", () => {
    expect(view).not.toMatch(/display_name|username|email/);
  });
});

describe("down migration'ları", () => {
  for (const migration of migrations) {
    it(`${migration.path} up'ı tersine çevirir`, () => {
      const created = [
        ...stripComments(migration.up).matchAll(/create (table|view) (?:if not exists )?([a-z_][a-z0-9_]*)/g),
      ].map((match) => match[2] ?? "");
      const dropped = [
        ...stripComments(migration.down).matchAll(/drop (table|view) if exists ([a-z_][a-z0-9_]*)/g),
      ].map((match) => match[2] ?? "");
      const up = stripComments(migration.up);
      const down = stripComments(migration.down);
      const addedColumns = [...up.matchAll(/add column ([a-z_][a-z0-9_]*)/g)].map((match) => match[1] ?? "");
      const addedConstraints = [...up.matchAll(/add constraint ([a-z_][a-z0-9_]*)/g)].map((match) => match[1] ?? "");
      expect(created.length + addedColumns.length, "migration nesne ya da kolon eklemeli").toBeGreaterThan(0);
      expect([...dropped].reverse()).toEqual(created);
      // API-05 (005): `alter table` ekleri tersine düşürülmeli.
      for (const column of addedColumns) expect(down, column).toContain(`drop column if exists ${column}`);
      for (const constraint of addedConstraints) expect(down, constraint).toContain(`drop constraint if exists ${constraint}`);
      expect(
        down
          .replace(/drop [^\n]*\n?/g, "")
          .replace(/alter table [a-z_][a-z0-9_]*\s*/g, "")
          .trim(),
      ).toBe("");
    });
  }

  it("tüm nesneleri down tarafında da kapsar", () => {
    const downObjects = [...allDown.matchAll(/drop (?:table|view) if exists ([a-z_][a-z0-9_]*)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(downObjects.sort()).toEqual([...Object.keys(expectedColumns), "gami_leaderboard"].sort());
  });
});
