-- A1 (ADR-009): sunucu vaka oturumu. Uygulama ve değerlendirme vakaları yalnız
-- sunucuda; oturum durumu (seçilen vakalar, opak jeton eşlemeleri, yanıtlar,
-- sonuçlar, ses erişimleri) tek jsonb alanında tutulur ve istemciye asla dönmez.
-- Kodlu seçenek/ses jetonları dışında serbest metin yanıt saklanmaz (KVKK).

-- Up Migration

create table sim_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  institution_id uuid not null,
  sim_id text not null,
  mode text not null,
  status text not null default 'open',
  state jsonb not null,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  finished_at timestamptz,
  constraint sim_sessions_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint sim_sessions_institution_id_fkey foreign key (institution_id) references institutions (id),
  constraint sim_sessions_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint sim_sessions_mode_check check (mode in ('practice', 'assessment')),
  constraint sim_sessions_status_check check (status in ('open', 'finished', 'expired'))
);

create index sim_sessions_user_open_idx on sim_sessions (user_id, sim_id, status);

-- Down Migration

drop table if exists sim_sessions;
