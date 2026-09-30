/**
 * Geliştirme girişi açıklamaları (audit B7). Yalnız `import.meta.env.DEV` dalından
 * okunur; üretim derlemesinde bu dal ölü kod olduğundan metinler pakete girmez.
 */
export const DEV_ENTRY_STRINGS = {
  title: "Geliştirme hesabı",
  admin: "Kullanıcı adı: admin · Parola: egemed",
  student: "Kullanıcı adı: ogrenci · Parola: egemed",
  note: "Yalnız yerel geliştirmede çalışır; üretimde bu giriş kapalıdır.",
} as const;
