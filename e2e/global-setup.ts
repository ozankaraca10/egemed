import { execSync } from "node:child_process";

const ARTIFACT_ENV_KEY = "EGEMED_E2E_ARTIFACT_RUN_ID";

function resolveRunId(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown-sha";
  }
}

export default async function globalSetup(): Promise<void> {
  process.env[ARTIFACT_ENV_KEY] = resolveRunId();
}
