-- Meydan Okuma (ADR-010, kabul 27 Eylül 2026): eşzamansız, süreli düello.
-- Davet kodu düz metin saklanmaz (sha256). İki tarafa aynı vakalar aynı sırayla
-- ve aynı seçenek sırasıyla verilir (vaka listesi + karıştırma tohumu burada).
-- Düello denemeleri `challenge` modunda yazılır: liderliğe/aylık ödüle girmez.

-- Up Migration

create table challenges (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  sim_id text not null,
  inviter_id uuid not null,
  opponent_id uuid,
  code_hash text not null,
  case_ids text[] not null,
  shuffle_seed bigint not null,
  status text not null default 'open',
  created_at timestamptz not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  constraint challenges_institution_id_fkey foreign key (institution_id) references institutions (id),
  constraint challenges_inviter_id_fkey foreign key (inviter_id) references users (id) on delete cascade,
  constraint challenges_opponent_id_fkey foreign key (opponent_id) references users (id) on delete set null,
  constraint challenges_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint challenges_status_check check (status in ('open', 'accepted', 'finished', 'expired'))
);

create index challenges_code_hash_idx on challenges (code_hash);
create index challenges_inviter_idx on challenges (inviter_id, created_at desc);
create index challenges_opponent_idx on challenges (opponent_id, created_at desc);

alter table sim_sessions add column challenge_id uuid;
alter table sim_sessions drop constraint if exists sim_sessions_mode_check;
alter table sim_sessions
  add constraint sim_sessions_mode_check check (mode in ('practice', 'assessment', 'challenge'));
alter table gami_attempts drop constraint if exists gami_attempts_mode_check;
alter table gami_attempts
  add constraint gami_attempts_mode_check check (mode in ('practice', 'assessment', 'challenge'));

-- Down Migration

delete from gami_attempts where mode = 'challenge';
alter table gami_attempts drop constraint if exists gami_attempts_mode_check;
alter table gami_attempts
  add constraint gami_attempts_mode_check check (mode in ('practice', 'assessment'));
delete from sim_sessions where mode = 'challenge';
alter table sim_sessions drop constraint if exists sim_sessions_mode_check;
alter table sim_sessions
  add constraint sim_sessions_mode_check check (mode in ('practice', 'assessment'));
alter table sim_sessions drop column if exists challenge_id;
drop table if exists challenges;
