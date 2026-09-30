import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * T286 — `docs/sema/` şemaları koddan kopmasın (depo sahibi kuralı, 1 Eki 2026):
 * şemayı etkileyen her değişiklik aynı görevde şemaya işlenir. Bu test kopukluğu
 * kapıda yakalar: migration tablosu/sütunu ↔ ER şeması, sim-host sözleşmesi ↔
 * mimari şeması.
 */

function read(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) throw new Error(`okunamadı: ${path}`);
  return content;
}

/** Yalnız "up" kısmı: `-- down` / `-- migrate:down` işaretinden sonrası geri almadır. */
function upPart(sql: string): string {
  return sql.split(/--\s*(?:migrate:down|down)\b/i)[0] ?? sql;
}

function migrationColumns(): Map<string, Set<string>> {
  const files = ts.sys.readDirectory("apps/api/migrations", [".sql"]).sort();
  const sql = files.map((file) => upPart(read(file))).join("\n");
  const tables = new Map<string, Set<string>>();
  for (const match of sql.matchAll(/create table (?:if not exists )?([a-z_]+)\s*\(([\s\S]*?)\n\);/gi)) {
    const columns = new Set<string>();
    for (const line of (match[2] ?? "").split("\n")) {
      const word = line.trim().split(/\s+/)[0] ?? "";
      if (/^[a-z_]+$/.test(word) && !["primary", "unique", "constraint", "check", "foreign"].includes(word)) columns.add(word);
    }
    tables.set(match[1]!, columns);
  }
  for (const match of sql.matchAll(/alter table (?:if exists )?([a-z_]+)\b([\s\S]*?);/gi)) {
    const columns = tables.get(match[1]!);
    if (columns === undefined) continue;
    for (const add of (match[2] ?? "").matchAll(/add column (?:if not exists )?([a-z_]+)/gi)) columns.add(add[1]!);
    for (const drop of (match[2] ?? "").matchAll(/drop column (?:if exists )?([a-z_]+)/gi)) columns.delete(drop[1]!);
  }
  return tables;
}

function erColumns(doc: string): Map<string, Set<string>> {
  const entities = new Map<string, Set<string>>();
  for (const match of doc.matchAll(/^\s*([a-z_][a-z0-9_]*)\s*\{\n([\s\S]*?)\n\s*\}\s*$/gm)) {
    const columns = new Set(
      (match[2] ?? "").split("\n").map((line) => line.trim().split(/\s+/)[1]).filter((name): name is string => name !== undefined),
    );
    entities.set(match[1]!, columns);
  }
  return entities;
}

describe("docs/sema şemaları kodla uyumlu", () => {
  it("ER şeması migration'lardaki her tabloyu ve sütunu birebir içerir", () => {
    const expected = migrationColumns();
    const documented = erColumns(read("docs/sema/veritabani.md"));
    expect(expected.size).toBeGreaterThan(0);
    for (const [table, columns] of expected) {
      const doc = documented.get(table);
      expect(doc, `docs/sema/veritabani.md: "${table}" tablosu yok — şemayı güncelle`).toBeDefined();
      expect([...(doc ?? [])].sort(), `docs/sema/veritabani.md: "${table}" sütunları migration ile uyuşmuyor`).toEqual([...columns].sort());
    }
  });

  it("mimari şeması sim-host sözleşmesinin her alanını ve ekran anahtarını anar", () => {
    const host = read("packages/sim-host/src/SimHost.ts");
    const doc = read("docs/sema/mimari.md") + read("docs/sema/urun.md");
    const context = /export interface SimMountContext \{([\s\S]*?)\n\}/.exec(host)?.[1] ?? "";
    const fields = [...context.matchAll(/^\s*readonly ([a-zA-Z]+)\??:/gm)].map((match) => match[1]!);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(doc.includes(`\`${field}`), `docs/sema/mimari.md: SimMountContext.${field} anılmıyor`).toBe(true);
    const keys = /SIM_SCREEN_KEYS = \[([^\]]*)\]/.exec(host)?.[1] ?? "";
    for (const key of keys.match(/"([a-z-]+)"/g) ?? []) {
      expect(doc.includes(`\`${key.replace(/"/g, "")}\``), `docs/sema: ekran anahtarı ${key} anılmıyor`).toBe(true);
    }
  });
});
