-- API-05 (Astra denetimi 2026-09-24): deneme XP'si sunucuda hesaplanır.
-- İstemcinin kodlu özetindeki `xp` artık yetkili değildir; XP'yi belirleyen
-- alanlar (mod, vaka sayısı, ipucu) ayrı kolonlardadır ve sınırlıdır. Profil
-- XP/düzey/seri aynı SQL ifadesinde (tek transaction) güncellenir.

-- Up Migration

alter table gami_attempts
  add column mode text not null default 'assessment',
  add column case_count int not null default 1,
  add column hints_used int not null default 0,
  add column xp int not null default 0,
  add constraint gami_attempts_mode_check check (mode in ('practice', 'assessment')),
  add constraint gami_attempts_case_count_check check (case_count between 1 and 100),
  add constraint gami_attempts_hints_used_check check (hints_used between 0 and 1000),
  add constraint gami_attempts_xp_check check (xp >= 0);

-- Down Migration

alter table gami_attempts
  drop constraint if exists gami_attempts_xp_check,
  drop constraint if exists gami_attempts_hints_used_check,
  drop constraint if exists gami_attempts_case_count_check,
  drop constraint if exists gami_attempts_mode_check,
  drop column if exists xp,
  drop column if exists hints_used,
  drop column if exists case_count,
  drop column if exists mode;
