import type { SimId } from "@egemed/contracts";
import type { SimLearnPort } from "@egemed/sim-host";

/**
 * YALNIZ GELİŞTİRME (DEV, API yok): öğrenme tamamlama kaydını sekme deposunda
 * taklit eder (`devLocalSessions` deseni). Anlam API ile aynıdır: kayıt varsa
 * `complete` doğrudur, `markComplete` kaydı açar. Bu dosya üretim paketine
 * girmez; yalnız `import.meta.env.DEV` kapısının ardındaki dinamik `import()`
 * ile yüklenir. Kişisel veri tutulmaz; değer yalnız "1"dir.
 */
export const DEV_LEARN_KEY_PREFIX = "egemed.learn.";

interface LearnStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function tabStorage(): LearnStorage | null {
  try {
    return (globalThis as { sessionStorage?: LearnStorage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function createDevLocalLearnPort(simId: SimId, storage: LearnStorage | null = tabStorage()): SimLearnPort {
  const key = `${DEV_LEARN_KEY_PREFIX}${simId}`;
  const read = (): boolean => {
    try {
      return storage?.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  return {
    get complete(): boolean {
      return read();
    },
    async markComplete(): Promise<void> {
      try {
        storage?.setItem(key, "1");
      } catch {
        // Depo kapalıysa (gizli pencere vb.) kayıt yazılamaz; hata yükseltilmez.
      }
    },
  };
}
