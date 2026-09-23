import ts from "typescript";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/ci.yml";

function readWorkflow(path: string): string {
  const content = ts.sys.readFile(path);
  if (content === undefined) {
    throw new Error(`İş akışı okunamadı: ${path}`);
  }
  return content;
}

const workflow = readWorkflow(workflowPath);

describe("CI iş akışı", () => {
  it("yalnız dev dalını tetikler, main hedeflemez", () => {
    const branches = workflow.match(/^\s*branches: \[(.+)\]$/gm) ?? [];
    expect(branches).toHaveLength(2);
    for (const line of branches) {
      expect(line).toContain("dev");
    }
    expect(workflow).not.toMatch(/\bmain\b/);
  });

  it("üç kapıyı tek gates işinde sırayla çalıştırır", () => {
    expect(workflow).toContain("jobs:\n  gates:");
    expect(workflow).toContain("name: gates");
    expect(workflow).toContain("pnpm turbo run lint typecheck test");
    expect(workflow).not.toContain("continue-on-error");
  });

  it("kilit dosyasını dondurarak kurar", () => {
    expect(workflow).toContain("pnpm install --frozen-lockfile");
  });

  it("Node sürümünü .nvmrc'den okur, sabit sürüm yazmaz", () => {
    expect(workflow).toContain("node-version-file: .nvmrc");
    expect(workflow).not.toMatch(/node-version:\s*\d/);
    expect(workflow).not.toMatch(/^\s+version:\s/m);
  });

  it("eylemleri 40 karakterlik SHA ile sabitler", () => {
    const usesLines = workflow.split("\n").filter((line) => /^\s*uses:/.test(line));
    expect(usesLines.length).toBeGreaterThanOrEqual(3);
    for (const line of usesLines) {
      expect(line, line).toMatch(/^\s*uses:\s+[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s+#\s+v\d/);
    }
  });

  it("salt okunur izin verir, sır kullanmaz", () => {
    expect(workflow).toContain("contents: read");
    expect(workflow).not.toMatch(/\bwrite\b/);
    expect(workflow).not.toContain("secrets.");
  });
});
