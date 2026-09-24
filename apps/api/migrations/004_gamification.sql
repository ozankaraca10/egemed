-- T61 — E3 §c: oyunlaştırma (profil, rozet, deneme) ve gami_leaderboard görünümü.
-- Her kayıt tek sim_id taşır; simler arası birleştirme yoktur (ADR-006). Rozet
-- anahtarı sim kapsamlıdır. Deneme özeti kodludur; ham öğrenci yanıtı hiçbir
-- kolonda tutulmaz (yalnız kodlu özet jsonb).

-- Up Migration

create table gami_profiles (
  user_id uuid not null,
  sim_id text not null,
  xp int not null default 0,
  level int not null default 1,
  streak_current int not null default 0,
  streak_best int not null default 0,
  streak_last_date date,
  updated_at timestamptz not null default now(),
  constraint gami_profiles_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint gami_profiles_pkey primary key (user_id, sim_id),
  constraint gami_profiles_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint gami_profiles_xp_check check (xp >= 0),
  constraint gami_profiles_level_check check (level >= 1)
);

create index gami_profiles_sim_xp_idx on gami_profiles (sim_id, xp desc);

create table gami_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sim_id text not null,
  badge_key text not null,
  awarded_at timestamptz not null default now(),
  constraint gami_badges_profile_fkey foreign key (user_id, sim_id) references gami_profiles (user_id, sim_id) on delete cascade,
  constraint gami_badges_badge_key_format_check check (badge_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  constraint gami_badges_user_sim_badge_key unique (user_id, sim_id, badge_key)
);

create table gami_attempts (
  id uuid primary key,
  user_id uuid not null,
  sim_id text not null,
  attempt_no int not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  score int,
  max_score int,
  passed boolean,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  constraint gami_attempts_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint gami_attempts_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint gami_attempts_attempt_no_check check (attempt_no > 0),
  constraint gami_attempts_score_check check (score <= max_score),
  -- score/max_score null olabilir (henüz puanlanmamış deneme); doluysa sınırlar geçerlidir.
  constraint gami_attempts_score_nonnegative_check check (score >= 0),
  constraint gami_attempts_max_score_positive_check check (max_score > 0),
  constraint gami_attempts_user_sim_attempt_key unique (user_id, sim_id, attempt_no)
);

create index gami_attempts_user_sim_finished_idx on gami_attempts (user_id, sim_id, finished_at desc);

create view gami_leaderboard as
select
  u.institution_id,
  p.sim_id,
  p.user_id,
  p.xp,
  p.level,
  rank() over (
    partition by u.institution_id, p.sim_id
    order by p.xp desc, p.updated_at asc
  ) as rank
from gami_profiles p
join users u on u.id = p.user_id
where u.status = 'active' and u.deleted_at is null;

-- Down Migration

drop view if exists gami_leaderboard;
drop table if exists gami_attempts;
drop table if exists gami_badges;
drop table if exists gami_profiles;
