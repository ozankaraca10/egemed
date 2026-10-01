-- T283b (ADR-009 §6 karar ucu): yönetici "confirmed" kararıyla rekabet alanlarından
-- (Meydan Okuma, liderlik, aylık ödül, değerlendirme/düello XP'si) engel açar.
-- Otomatik ceza YOK — bu tablo yalnız yönetici onayıyla yazılır (T283b adminRoutes).
-- Kullanıcı başına tek AKTİF engel: kısmi benzersiz dizin (`lifted_at is null`).

-- Up Migration

create table competition_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  flag_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  constraint competition_bans_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint competition_bans_flag_id_fkey foreign key (flag_id) references integrity_flags (id) on delete set null,
  constraint competition_bans_created_by_fkey foreign key (created_by) references users (id) on delete set null,
  constraint competition_bans_lifted_by_fkey foreign key (lifted_by) references users (id) on delete set null
);

create unique index competition_bans_active_user_idx on competition_bans (user_id) where lifted_at is null;
create index competition_bans_user_created_idx on competition_bans (user_id, created_at desc);

-- Down Migration

drop table if exists competition_bans;
