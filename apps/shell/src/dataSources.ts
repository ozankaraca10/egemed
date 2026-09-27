/**
 * T89 — admin ve dashboard veri kaynakları tek fabrikadan gelir.
 * API oturumu (`apiSessionBaseUrl`) yoksa sayfalar aynı mock örneğini paylaşır;
 * varsa `apiShellSources` API istemcisini bağlar. `1450` XP sentetiği yalnız
 * sahte oturumda kalır.
 */

import { createContext, createElement, useContext, useRef, type ReactNode } from "react";
import { createMockAuditSource, type AuditDataSource } from "./admin/auditDataSource";
import { createMockImportsSource, type ImportsDataSource } from "./admin/importsDataSource";
import { createMockRewardsSource, type RewardsDataSource } from "./admin/rewardsDataSource";
import { createMockUsersSource, type UsersDataSource } from "./admin/usersDataSource";
import {
  createSyntheticGamificationSource,
  type GamificationSource,
} from "./home/gamificationSource";
import type { ShellSession } from "./session";
import { createSyntheticShowcaseSource, type ShowcaseSource } from "./home/showcaseSource";
import type { ChallengeSource } from "./challenges/challengeSource";
import type { LearnSource } from "./learn/learnSource";

export interface LeaderboardPreferencesSource {
  getVisible(): Promise<boolean>;
  setVisible(visible: boolean): Promise<boolean>;
}

export interface ShellDataSources {
  readonly users: UsersDataSource;
  readonly imports: ImportsDataSource;
  readonly audit: AuditDataSource;
  /** Aylık ödüller (T186); sim başına CRUD + kesinleştirme, admin oturumunda kullanılır. */
  readonly rewards: RewardsDataSource;
  /** API oturumunda `session === null` iken boş döner; `1450` XP üretmez. */
  gamification(session: ShellSession | null): GamificationSource;
  /** Sahte oturumda `null`; API oturumunda liderlik görünürlüğü. */
  leaderboardPreferences(session: ShellSession | null): LeaderboardPreferencesSource | null;
  /** Ana sayfa liderlik vitrini (26 Eyl 2026); oturumsuz (ziyaretçi) iken null. */
  showcase(session: ShellSession | null): ShowcaseSource | null;
  /** ADR-010 Meydan Okuma; yalnız API oturumunda (sahte oturumda null). */
  challenges(session: ShellSession | null): ChallengeSource | null;
  /** Öğrenme tamamlama kaydı (27 Eyl 2026); yalnız API oturumunda (sahte oturumda null). */
  learn(session: ShellSession | null): LearnSource | null;
}

const ShellDataSourcesContext = createContext<ShellDataSources | null>(null);

export function ShellDataSourcesProvider({
  sources,
  children,
}: {
  readonly sources: ShellDataSources;
  readonly children: ReactNode;
}): ReactNode {
  return createElement(ShellDataSourcesContext.Provider, { value: sources }, children);
}

export function useShellDataSources(): ShellDataSources | null {
  return useContext(ShellDataSourcesContext);
}

/** Prop verilmişse onu, bağlam varsa onu, yoksa sayfa testinin kendi mock'unu kullanır. */
export function useShellSource<T>(
  injected: T | undefined,
  pick: (sources: ShellDataSources) => T,
  fallback: () => T,
): T {
  const sources = useShellDataSources();
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = injected ?? (sources === null ? fallback() : pick(sources));
  }
  return ref.current;
}

/** Sahte dev oturumu: tek mock örneği, sayfalar arası aynı tohum. */
export function createMockShellDataSources(): ShellDataSources {
  const users = createMockUsersSource();
  const imports = createMockImportsSource();
  const audit = createMockAuditSource();
  const rewards = createMockRewardsSource();
  const syntheticShowcase = createSyntheticShowcaseSource();
  return {
    audit,
    rewards,
    gamification(session) {
      return createSyntheticGamificationSource(session !== null);
    },
    leaderboardPreferences() {
      return null;
    },
    showcase(session) {
      return session === null ? null : syntheticShowcase;
    },
    challenges() {
      return null;
    },
    learn() {
      return null;
    },
    imports,
    users,
  };
}
