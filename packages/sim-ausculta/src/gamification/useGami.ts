import { useEffect, useState } from "react";
import type { LocalGamiRepository } from "./repo";

export function useGamiProgress(now: Date, repo: LocalGamiRepository) {
  const [, refresh] = useState(0);
  useEffect(() => repo.subscribe(() => refresh((version) => version + 1)), [repo]);
  const state = repo.snapshot();
  return { state, ...repo.summary(now) };
}
