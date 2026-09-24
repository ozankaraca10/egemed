import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

const DEFAULT_RUN_ID = "unknown-sha";
const ARTIFACT_ENV_KEY = "EGEMED_E2E_ARTIFACT_RUN_ID";

export interface AxeViolationArtifact {
  help: string;
  id: string;
  impact: string | null;
  targets: string[];
}

export interface SummaryTestResult {
  durationMs: number;
  file: string;
  project: string;
  retry: number;
  status: string;
  title: string;
}

export interface SummaryScreenshotHash {
  file: string;
  sha256: string;
}

export interface SummaryJson {
  browserVersion: string;
  commitSha: string;
  runId: string;
  screenshotSha256: SummaryScreenshotHash[];
  tests: SummaryTestResult[];
  totals: {
    failed: number;
    flaky: number;
    interrupted: number;
    passed: number;
    skipped: number;
    timedOut: number;
    total: number;
  };
}

export function getRunId(): string {
  const raw = process.env[ARTIFACT_ENV_KEY];
  const runId = raw?.trim();
  return runId && runId.length > 0 ? runId : DEFAULT_RUN_ID;
}

export function getArtifactRoot(): string {
  return path.resolve(process.cwd(), "e2e-artifacts", getRunId());
}

export function getSummaryPath(): string {
  return path.join(getArtifactRoot(), "summary.json");
}

function slugifyProject(projectName: string): string {
  return projectName.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-");
}

function slugifyRoute(hash: string): string {
  const withoutPrefix = hash.replace(/^#\/?/, "");
  if (withoutPrefix.length === 0) {
    return "root";
  }
  return withoutPrefix.replace(/\//g, "__").replace(/[^a-z0-9_-]+/gi, "-");
}

function screenshotPath(projectName: string, routeHash: string): string {
  return path.join(
    getArtifactRoot(),
    "screenshots",
    slugifyProject(projectName),
    `${slugifyRoute(routeHash)}.png`,
  );
}

function axePath(projectName: string, routeHash: string): string {
  return path.join(
    getArtifactRoot(),
    "axe",
    slugifyProject(projectName),
    `${slugifyRoute(routeHash)}.json`,
  );
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeArtifactJson(filePath: string, payload: unknown): Promise<void> {
  await ensureParentDir(filePath);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function captureRouteScreenshot(
  page: Page,
  projectName: string,
  routeHash: string,
): Promise<void> {
  const filePath = screenshotPath(projectName, routeHash);
  await ensureParentDir(filePath);
  await page.screenshot({ fullPage: true, path: filePath });
}

export async function writeAxeArtifact(
  projectName: string,
  routeHash: string,
  violations: AxeViolationArtifact[],
): Promise<void> {
  const filePath = axePath(projectName, routeHash);
  await writeArtifactJson(filePath, {
    project: projectName,
    route: routeHash,
    violationCount: violations.length,
    violations,
  });
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

/**
 * E2E sonunda üretilen özetin temel alanları bu doğrulamadan geçmek zorunda.
 * Bozulursa reporter hata vererek kapıyı kırar.
 */
export function assertSummarySchema(summary: unknown): asserts summary is SummaryJson {
  if (typeof summary !== "object" || summary === null) {
    throw new Error("summary.json şema hatası: kök nesne olmalı.");
  }
  const root = summary as Record<string, unknown>;
  if (!isString(root["commitSha"]) || root["commitSha"].length === 0) {
    throw new Error("summary.json şema hatası: commitSha zorunlu.");
  }
  if (!isString(root["browserVersion"]) || root["browserVersion"].length === 0) {
    throw new Error("summary.json şema hatası: browserVersion zorunlu.");
  }
  if (!isString(root["runId"]) || root["runId"].length === 0) {
    throw new Error("summary.json şema hatası: runId zorunlu.");
  }

  const totals = root["totals"];
  if (typeof totals !== "object" || totals === null) {
    throw new Error("summary.json şema hatası: totals nesnesi zorunlu.");
  }
  for (const key of ["total", "passed", "failed", "skipped", "timedOut", "interrupted", "flaky"] as const) {
    if (!isNonNegativeNumber((totals as Record<string, unknown>)[key])) {
      throw new Error(`summary.json şema hatası: totals.${key} sayı olmalı.`);
    }
  }

  const tests = root["tests"];
  if (!Array.isArray(tests)) {
    throw new Error("summary.json şema hatası: tests dizi olmalı.");
  }
  for (const test of tests) {
    if (typeof test !== "object" || test === null) {
      throw new Error("summary.json şema hatası: tests girdileri nesne olmalı.");
    }
    const entry = test as Record<string, unknown>;
    if (
      !isString(entry["project"]) ||
      !isString(entry["file"]) ||
      !isString(entry["title"]) ||
      !isString(entry["status"]) ||
      !isNonNegativeNumber(entry["durationMs"]) ||
      !isNonNegativeNumber(entry["retry"])
    ) {
      throw new Error("summary.json şema hatası: tests girdisi alanları eksik.");
    }
  }

  const screenshots = root["screenshotSha256"];
  if (!Array.isArray(screenshots)) {
    throw new Error("summary.json şema hatası: screenshotSha256 dizi olmalı.");
  }
  for (const shot of screenshots) {
    if (typeof shot !== "object" || shot === null) {
      throw new Error("summary.json şema hatası: screenshot girdileri nesne olmalı.");
    }
    const entry = shot as Record<string, unknown>;
    if (!isString(entry["file"]) || !isString(entry["sha256"])) {
      throw new Error("summary.json şema hatası: screenshot girdisi file+sha256 içermeli.");
    }
  }
}
