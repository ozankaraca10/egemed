import vignettesData from "./vignettes.json";

/** T322 — öğrenme modu hasta kartının eğitim bölümleri (depo sahibi, 3 Eki 2026): kurgusal ama
 *  kılavuza uygun başvuru öyküsü, ayırıcı tanı ve öğretici not. Yapay zekâ ile üretildi (gpt-6-sol),
 *  Claude tarafından kayıtla tutarlılık ve tıbbi doğruluk için denetlendi; hekim onayı bekliyor.
 *  Üretici: `egemed-tools/opaca-vinyet/v2/` (girdi, plan, denetim kaydı). Tedavi/ilaç içermez. */

export interface VignetteRef {
  readonly title: string;
  readonly url: string;
}

export interface VignetteDifferential {
  readonly dx: string;
  readonly clue: string;
}

export interface Vignette {
  readonly presentation: readonly string[];
  readonly presentationRef: VignetteRef;
  readonly differential: readonly VignetteDifferential[];
  readonly differentialRef: VignetteRef;
  readonly pearl: { readonly text: string; readonly ref: VignetteRef };
}

const VIGNETTES = (vignettesData as unknown as { images: Record<string, Vignette> }).images;

export function vignetteFor(imageId: string): Vignette | null {
  return VIGNETTES[imageId] ?? null;
}
