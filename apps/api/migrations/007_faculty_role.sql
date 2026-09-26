-- Öğretim üyesi rolü (depo sahibi kararı, 26 Eylül 2026). Öğretim üyesi simleri
-- kullanır; rozet, XP, liderlik ve Meydan Okuma'ya katılmaz (API yetki katmanı).

-- Up Migration

alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles
  add constraint user_roles_role_check check (role in ('admin', 'kullanici', 'ogretim_uyesi'));

-- Down Migration

delete from user_roles where role = 'ogretim_uyesi';
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles
  add constraint user_roles_role_check check (role in ('admin', 'kullanici'));
