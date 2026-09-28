-- Uzmanlık öğrencisi rolü (depo sahibi kararı, 28 Eylül 2026). Uzmanlık
-- öğrencisi simleri kullanır; rozet, XP, liderlik ve Meydan Okuma'ya katılmaz
-- (API yetki katmanı), öğrenme kilidi ona uygulanmaz.

-- Up Migration

alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles
  add constraint user_roles_role_check check (role in ('admin', 'kullanici', 'ogretim_uyesi', 'uzmanlik_ogrencisi'));

-- Down Migration

delete from user_roles where role = 'uzmanlik_ogrencisi';
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles
  add constraint user_roles_role_check check (role in ('admin', 'kullanici', 'ogretim_uyesi'));
