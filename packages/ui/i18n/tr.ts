/** Türkçe arayüz sözlüğü; arayüz metinleri yalnız buradan gelir (AGENTS.md). */
export const tr = {
  "badge.tone.info": "Bilgi",
  "badge.tone.success": "Başarılı",
  "badge.tone.warning": "Uyarı",
  "badge.tone.danger": "Hata",
  "table.empty": "Kayıt bulunamadı",
} as const;

export type TrKey = keyof typeof tr;

/** Anahtarı Türkçe metne çözer; geçersiz anahtar derleme zamanında reddedilir. */
export function t(key: TrKey): string {
  return tr[key];
}
