import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function lintRuleIds(code: string, filePath: string): Promise<(string | null)[]> {
  const results = await eslint.lintText(code, { filePath, warnIgnored: false });
  const ruleIds = results.flatMap((result) => {
    expect(
      result.fatalErrorCount,
      result.messages.map((message) => message.message).join("; "),
    ).toBe(0);
    return result.messages.map((message) => message.ruleId);
  });
  return ruleIds.sort();
}

describe("eslint yapılandırması", () => {
  it("Date.now() kullanımını engeller", async () => {
    const ruleIds = await lintRuleIds(
      "export const now = (): number => Date.now();\n",
      "tests/fixtures/date-now.ts",
    );
    expect(ruleIds).toEqual(["no-restricted-properties"]);
  });

  it("kullanılmayan değişkeni yakalar", async () => {
    const ruleIds = await lintRuleIds("const unused = 1;\nexport {};\n", "tests/fixtures/unused.ts");
    expect(ruleIds).toContain("@typescript-eslint/no-unused-vars");
  });

  it("temiz TypeScript parçasında mesaj üretmez", async () => {
    const ruleIds = await lintRuleIds('export const value: string = "temiz";\n', "tests/fixtures/clean.ts");
    expect(ruleIds).toEqual([]);
  });

  it("dist altındaki dosyaları yok sayar", async () => {
    const ruleIds = await lintRuleIds(
      "export const now = (): number => Date.now();\n",
      "dist/ignored.ts",
    );
    expect(ruleIds).toEqual([]);
  });
});
