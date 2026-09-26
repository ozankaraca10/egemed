import type { SimAudience } from "@egemed/sim-host";
import type { ShellSession } from "./session";

/**
 * Ziyaretçi modu (depo sahibi kararı, 26 Eylül 2026): hesapsız gezinme. Giriş
 * ekranındaki "Ziyaretçi olarak göz at" bir sekme ömürlük işaret bırakır
 * (`sessionStorage`); simler yalnız sınırlı öğrenme modunu açar ve kilitli
 * öğelerde "Yalnızca Ege Üniversitesi Tıp Fakültesi öğrencileri yararlanabilir"
 * der. Kişisel veri tutulmaz; işaret yalnız "1"dir. Kök tsconfig DOM'suz olduğu
 * için depo yapısal tiptedir.
 */
export const VISITOR_STORAGE_KEY = "egemed.visitor";

export interface VisitorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function readVisitor(storage: VisitorStorage | null): boolean {
  try {
    return storage?.getItem(VISITOR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function startVisitor(storage: VisitorStorage | null): void {
  try {
    storage?.setItem(VISITOR_STORAGE_KEY, "1");
  } catch {
    // Depo kapalıysa (gizli pencere vb.) ziyaretçi yine gezinir; üretimde oturumsuzluk zaten ziyaretçidir.
  }
}

export function endVisitor(storage: VisitorStorage | null): void {
  try {
    storage?.removeItem(VISITOR_STORAGE_KEY);
  } catch {
    // Yok say.
  }
}

/**
 * Sime giden kitle:
 * - oturum varsa: öğretim üyesi rolü → `faculty`, değilse `student`;
 * - oturum yoksa: ziyaretçi işareti ya da üretim (giriş olmadan gezinme) → `visitor`;
 * - geliştirmede işaretsiz oturumsuz gezinme bugünkü gibi `student` kalır (demo/e2e).
 */
export function audienceFor(input: {
  readonly session: ShellSession | null;
  readonly visitor: boolean;
  readonly dev: boolean;
}): SimAudience {
  if (input.session !== null) return input.session.faculty === true ? "faculty" : "student";
  return input.visitor || !input.dev ? "visitor" : "student";
}
