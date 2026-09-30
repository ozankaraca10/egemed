-- T283a (ADR-009 §6 ek sertleştirme): sunucu davranış sinyalleri ve işaretleme.
-- Yalnız TESPİT — engelleme ve sonuçlar T283b, istemci sinyalleri T283c, yönetim
-- arayüzü T283d. Hiçbir puan/XP/rozet burada değişmez. `signals` yalnız sayı ve
-- sinyal adı taşır; serbest metin yoktur (KVKK). `note` yalnız yönetici notu
-- içindir (T283b karar uçları doldurur); bu görev hiç yazmaz.

-- Up Migration

create table integrity_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  sim_id text not null,
  mode text not null,
  score numeric not null,
  signals jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  note text,
  constraint integrity_flags_session_id_fkey foreign key (session_id) references sim_sessions (id) on delete cascade,
  constraint integrity_flags_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint integrity_flags_reviewed_by_fkey foreign key (reviewed_by) references users (id) on delete set null,
  constraint integrity_flags_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint integrity_flags_mode_check check (mode in ('practice', 'assessment', 'challenge')),
  constraint integrity_flags_score_check check (score >= 0),
  constraint integrity_flags_status_check check (status in ('pending', 'cleared', 'confirmed'))
);

create index integrity_flags_status_created_idx on integrity_flags (status, created_at desc);
create index integrity_flags_session_idx on integrity_flags (session_id);

alter table sim_sessions add column integrity_status text;
alter table sim_sessions add constraint sim_sessions_integrity_status_check check (integrity_status in ('unverified', 'verified'));

-- Down Migration

alter table sim_sessions drop constraint if exists sim_sessions_integrity_status_check;
alter table sim_sessions drop column if exists integrity_status;
drop table if exists integrity_flags;
