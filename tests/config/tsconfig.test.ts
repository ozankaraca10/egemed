import ts from "typescript";
import { describe, expect, it } from "vitest";

const requiredFlags = [
  "strict",
  "noUncheckedIndexedAccess",
  "exactOptionalPropertyTypes",
  "verbatimModuleSyntax",
] as const;

const baseConfigPath = "tsconfig.base.json";

function createHost(): ts.ParseConfigFileHost {
  return {
    fileExists: (fileName) => ts.sys.fileExists(fileName),
    readFile: (fileName) => ts.sys.readFile(fileName),
    readDirectory: (path, extensions, exclude, include, depth) =>
      ts.sys.readDirectory(path, extensions, exclude, include, depth),
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  };
}

function parseConfig(configFileName: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(configFileName, {}, createHost());
  if (parsed === undefined) {
    throw new Error(`tsconfig okunamadı: ${configFileName}`);
  }
  return parsed;
}

function readRawExtends(configFileName: string): unknown {
  const source = ts.readConfigFile(configFileName, (fileName) => ts.sys.readFile(fileName));
  if (source.error !== undefined) {
    throw new Error(ts.flattenDiagnosticMessageText(source.error.messageText, "\n"));
  }
  return (source.config as { extends?: unknown }).extends;
}

function assertRequiredFlags(configFileName: string): void {
  const parsed = parseConfig(configFileName);
  expect(parsed.errors, `${configFileName} hataları`).toEqual([]);
  for (const flag of requiredFlags) {
    expect(parsed.options[flag], `${configFileName} → ${flag}`).toBe(true);
  }
}

const appConfigs = ts.sys
  .readDirectory("apps", [".json"], ["**/node_modules/**"], ["*/tsconfig.json"])
  .sort();

const packageConfigs = ts.sys
  .readDirectory("packages", [".json"], ["**/node_modules/**"], ["*/tsconfig.json"])
  .sort();

describe("tsconfig sözleşmesi", () => {
  it("apps altındaki uygulama tsconfig'lerini bulur", () => {
    expect(appConfigs).toEqual(["apps/api/tsconfig.json", "apps/shell/tsconfig.json"]);
  });

  it("her uygulama tsconfig'i kök base dosyasını genişletir", () => {
    for (const configFileName of appConfigs) {
      expect(readRawExtends(configFileName), configFileName).toBe("../../tsconfig.base.json");
    }
  });

  it("her uygulama tsconfig'i dört strict bayrağı korur", () => {
    for (const configFileName of appConfigs) {
      assertRequiredFlags(configFileName);
    }
  });

  it("packages altındaki paket tsconfig'lerini bulur", () => {
    expect(packageConfigs).toEqual([
      "packages/api-client/tsconfig.json",
      "packages/contracts/tsconfig.json",
      "packages/gamification-core/tsconfig.json",
      "packages/sim-ausculta/tsconfig.json",
      "packages/sim-host/tsconfig.json",
      "packages/sim-opaca/tsconfig.json",
      "packages/sim-pulse/tsconfig.json",
      "packages/ui/tsconfig.json",
      "packages/xapi-profile/tsconfig.json",
    ]);
  });

  it("her paket tsconfig'i kök base dosyasını genişletir", () => {
    for (const configFileName of packageConfigs) {
      expect(readRawExtends(configFileName), configFileName).toBe("../../tsconfig.base.json");
    }
  });

  it("her paket tsconfig'i dört strict bayrağı korur", () => {
    for (const configFileName of packageConfigs) {
      assertRequiredFlags(configFileName);
    }
  });

  it("base dosyası dört strict bayrağı açar", () => {
    assertRequiredFlags(baseConfigPath);
  });
});
