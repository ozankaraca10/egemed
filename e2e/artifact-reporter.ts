import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import type {
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";
import {
  assertSummarySchema,
  getArtifactRoot,
  getRunId,
  getSummaryPath,
  type SummaryJson,
  type SummaryTestResult,
  writeArtifactJson,
} from "./artifacts";

function resolveCommitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown-sha";
  }
}

async function resolveBrowserVersion(): Promise<string> {
  try {
    const browser = await chromium.launch();
    const version = browser.version();
    await browser.close();
    return version;
  } catch {
    return "unknown";
  }
}

async function listFilesRecursive(targetDir: string): Promise<string[]> {
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry): Promise<string[]> => {
        const fullPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
          return listFilesRecursive(fullPath);
        }
        return [fullPath];
      }),
    );
    return nested.flat();
  } catch {
    return [];
  }
}

async function collectScreenshotHashes(artifactRoot: string): Promise<SummaryJson["screenshotSha256"]> {
  const screenshotsRoot = path.join(artifactRoot, "screenshots");
  const files = await listFilesRecursive(screenshotsRoot);
  const pngFiles = files.filter((filePath) => filePath.endsWith(".png")).sort();
  return Promise.all(
    pngFiles.map(async (filePath) => {
      const content = await readFile(filePath);
      const sha256 = createHash("sha256").update(content).digest("hex");
      return {
        file: path.relative(artifactRoot, filePath),
        sha256,
      };
    }),
  );
}

function summarizeTest(test: TestCase): SummaryTestResult {
  const lastResult: TestResult | undefined = test.results.at(-1);
  const durationMs = test.results.reduce((total, result) => total + result.duration, 0);
  const titlePath = test.titlePath().filter((segment) => segment.length > 0);
  const project = titlePath[0] ?? "unknown-project";
  const file = titlePath[1] ?? "unknown-file";
  const title = titlePath.slice(2).join(" › ") || test.title;
  return {
    durationMs,
    file,
    project,
    retry: lastResult?.retry ?? 0,
    status: lastResult?.status ?? "unknown",
    title,
  };
}

function countTotals(tests: SummaryTestResult[]): SummaryJson["totals"] {
  const totals = {
    failed: 0,
    flaky: 0,
    interrupted: 0,
    passed: 0,
    skipped: 0,
    timedOut: 0,
    total: tests.length,
  };

  for (const test of tests) {
    switch (test.status) {
      case "passed":
        totals.passed += 1;
        if (test.retry > 0) {
          totals.flaky += 1;
        }
        break;
      case "failed":
        totals.failed += 1;
        break;
      case "skipped":
        totals.skipped += 1;
        break;
      case "timedOut":
        totals.timedOut += 1;
        break;
      case "interrupted":
        totals.interrupted += 1;
        break;
      default:
        totals.failed += 1;
        break;
    }
  }
  return totals;
}

export default class ArtifactReporter implements Reporter {
  private rootSuite: Suite | null = null;

  onBegin(_config: unknown, suite: Suite): void {
    this.rootSuite = suite;
  }

  async onEnd(): Promise<void> {
    if (!this.rootSuite) {
      throw new Error("ArtifactReporter: test suite başlatılamadı.");
    }

    const runId = getRunId();
    const commitSha = resolveCommitSha();
    const browserVersion = await resolveBrowserVersion();
    const artifactRoot = getArtifactRoot();

    const tests = this.rootSuite
      .allTests()
      .map((test) => summarizeTest(test))
      .sort((a, b) => {
        if (a.project !== b.project) return a.project.localeCompare(b.project, "tr");
        if (a.file !== b.file) return a.file.localeCompare(b.file, "tr");
        return a.title.localeCompare(b.title, "tr");
      });

    const screenshotSha256 = await collectScreenshotHashes(artifactRoot);
    const totals = countTotals(tests);
    const summary: SummaryJson = {
      browserVersion,
      commitSha,
      runId,
      screenshotSha256,
      tests,
      totals,
    };

    // E2E içi küçük kontrol: summary üretimi bu şema doğrulamasından geçmeli.
    assertSummarySchema(summary);
    await writeArtifactJson(getSummaryPath(), summary);
  }
}
