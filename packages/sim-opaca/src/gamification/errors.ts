import { GamiRepositoryUnsupportedError } from "@egemed/gamification-core";
import { GAMI_SYNC_READ_ERROR, GAMI_SYNC_WRITE_ERROR, GAMI_UNSUPPORTED_METHOD } from "./messages";

export function formatGamiSyncError(error: unknown, kind: "read" | "write" = "read"): string {
  if (error instanceof GamiRepositoryUnsupportedError) {
    return GAMI_UNSUPPORTED_METHOD;
  }
  if (kind === "write") return GAMI_SYNC_WRITE_ERROR;
  return GAMI_SYNC_READ_ERROR;
}
