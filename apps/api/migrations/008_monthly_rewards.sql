-- Aylık ödüller admin panelinden yönetilir (depo sahibi kararı, 26 Eylül 2026).
-- Ödül kurum × sim × ay başınadır; simler arası ödül yoktur (ADR-006). Kazananlar
-- ay kapanınca admin "kesinleştir" dediğinde o ayın sıralamasından anlık görüntü
-- olarak yazılır; ad yalnız adla görünmeyi seçmiş (uygunluk koşulu) öğrencidir.

-- Up Migration

create table monthly_rewards (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  sim_id text not null,
  month text not null,
  title text not null,
  description text not null,
  sponsor text not null,
  winners_count int not null,
  cohorts int[] not null,
  min_assessments int not null,
  require_public_name boolean not null default true,
  terms text[] not null default '{}',
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint monthly_rewards_institution_id_fkey foreign key (institution_id) references institutions (id),
  constraint monthly_rewards_updated_by_fkey foreign key (updated_by) references users (id) on delete set null,
  constraint monthly_rewards_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint monthly_rewards_month_format_check check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint monthly_rewards_winners_count_check check (winners_count between 1 and 10),
  constraint monthly_rewards_min_assessments_check check (min_assessments between 0 and 100),
  constraint monthly_rewards_institution_sim_month_key unique (institution_id, sim_id, month)
);

create table reward_winners (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null,
  rank int not null,
  display_name text not null,
  score numeric(6, 2) not null,
  constraint reward_winners_reward_id_fkey foreign key (reward_id) references monthly_rewards (id) on delete cascade,
  constraint reward_winners_rank_check check (rank between 1 and 10),
  constraint reward_winners_reward_rank_key unique (reward_id, rank)
);

-- Down Migration

drop table if exists reward_winners;
drop table if exists monthly_rewards;
