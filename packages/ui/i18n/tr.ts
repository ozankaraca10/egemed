/** Türkçe arayüz sözlüğü; arayüz metinleri yalnız buradan gelir (AGENTS.md). */
export const tr = {
  "badge.tone.info": "Bilgi",
  "badge.tone.success": "Başarılı",
  "badge.tone.warning": "Uyarı",
  "badge.tone.danger": "Hata",
  "modal.close": "Kapat",
  "table.empty": "Kayıt bulunamadı",
  "shell.brand": "EGEMED CLIX",
  "shell.skip": "İçeriğe geç",
  "shell.nav.label": "Ana gezinme",
  "shell.nav.home": "Ana",
  "shell.nav.simulators": "Simülatörler",
  "shell.nav.tasks": "Görevler",
  "shell.nav.notebook": "Not Defteri",
  "shell.home.title": "Ana",
  "shell.home.body": "EGEMED CLIX klinik öğrenme platformuna hoş geldiniz.",
  "shell.simulators.title": "Simülatörler",
  "shell.simulators.body": "Üç simülatör bağımsız çalışır; her biri kendi başına açılır.",
  "shell.sim.pulse": "Pulse",
  "shell.sim.ausculta": "Ausculta",
  "shell.sim.opaca": "Opaca",
  "shell.soon": "Yakında",
  "shell.tasks.title": "Görevler",
  "shell.tasks.body": "Ders ve ödev takibi Moodle üzerinden yürütülür.",
  "shell.notebook.title": "Not Defteri",
  "shell.notebook.body": "Not defteri Moodle'da tutulur.",
  "shell.notebook.pending": "Moodle bağlantısı eklenecek (yer tutucu).",
  "shell.notFound.title": "Sayfa bulunamadı",
  "shell.notFound.body": "Bu adres kabukta tanımlı değil.",
  "shell.notFound.link": "Ana sayfaya dön",
} as const;

export type TrKey = keyof typeof tr;

/** Anahtarı Türkçe metne çözer; geçersiz anahtar derleme zamanında reddedilir. */
export function t(key: TrKey): string {
  return tr[key];
}
