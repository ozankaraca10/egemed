/** Türkçe arayüz sözlüğü; arayüz metinleri yalnız buradan gelir (AGENTS.md). */
export const tr = {
  "badge.tone.info": "Bilgi",
  "badge.tone.success": "Başarılı",
  "badge.tone.warning": "Uyarı",
  "badge.tone.danger": "Hata",
  "modal.close": "Kapat",
  "table.empty": "Kayıt bulunamadı",
  "entry.brand": "EGEMED CLIX",
  "entry.tagline": "Klinik öğrenme deneyimi tek platformda.",
  "entry.admin.title": "Yönetici girişi",
  "entry.role.admin": "Yönetici",
  "entry.student.title": "Test öğrencisi girişi",
  "entry.role.student": "Test öğrencisi",
  "entry.field.username": "Kullanıcı adı",
  "entry.field.password": "Parola",
  "entry.error.required": "Bu alan zorunludur.",
  "entry.error.invalid": "Kullanıcı adı veya parola hatalı.",
  "entry.action.login": "Giriş yap",
  "entry.back": "Geri dön",
  "entry.session.synthetic":
    "Bu sentetik test oturumu yalnız geliştirme ortamı içindir; gerçek öğrenci verisi kullanılmaz.",
  "entry.auth.pending": "Kimlik doğrulama henüz bağlı değil; bu ekran yalnız önizlemedir.",
  "entry.dev.title": "Geliştirme hesabı",
  "entry.dev.admin": "Kullanıcı adı: admin · Parola: egemed",
  "entry.dev.student": "Kullanıcı adı: ogrenci · Parola: egemed",
  "entry.dev.note": "Yalnız yerel geliştirmede çalışır; üretimde bu giriş kapalıdır.",
  "entry.help": "Giriş bilgileriniz kurum hesabınızla yönetilir; sorun için kurum BT birimine başvurun.",
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
  "shell.session.admin": "Sahte yönetici",
  "shell.session.student": "Sahte test öğrencisi",
  "shell.session.logout": "Çıkış yap",
  "shell.session.banner": "Geliştirme oturumu: gerçek kimlik doğrulama yok, veri kaydedilmez.",
  "admin.title": "Yönetici paneli",
  "admin.intro":
    "Yönetici alanı taslağı. Bölümler kimlik ve yetki kararlarından (K1, K4) sonra açılacak.",
  "admin.soon": "Yakında",
  "admin.section.overview": "Özet",
  "admin.section.users": "Kullanıcılar",
  "admin.section.roles": "Roller ve erişim",
  "admin.section.sims": "Simülatörler ve içerik",
  "admin.section.integrations": "Entegrasyonlar",
  "admin.section.audit": "Denetim ve ayarlar",
  "admin.section.overview.desc":
    "Kurum ve simülatör erişilebilirliği, son entegrasyon hataları, bekleyen yönetim işleri; bireysel öğrenci puanı yok.",
  "admin.section.users.desc":
    "Kurum dizininden gelen kullanıcıları arama, rol ve kapsam görüntüleme; seçilen kimlik modeline göre davet ve etkinleştirme.",
  "admin.section.roles.desc":
    "Rol matrisi, simülatör bazlı erişim, birim kapsamı, yetki değişikliği onayı.",
  "admin.section.sims.desc": "Modül durumu, sürüm, görünürlük, içerik ataması.",
  "admin.section.integrations.desc":
    "Moodle/LTI ve LRS bağlantı sağlığı, anahtarların yalnız durumu; sır değeri ekranda gösterilmez.",
  "admin.section.audit.desc":
    "Yönetici eylemleri, kurum ayarları, saklama ve erişim politikası.",
} as const;

export type TrKey = keyof typeof tr;

/** Anahtarı Türkçe metne çözer; geçersiz anahtar derleme zamanında reddedilir. */
export function t(key: TrKey): string {
  return tr[key];
}
