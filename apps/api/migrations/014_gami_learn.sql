-- A4 (ADR-009): eski istemci deneme yolu kapandı. `POST /me/gamification/:simId/attempts`
-- artık yalnız PUANSIZ öğrenme kaydı kabul eder; uygulama/değerlendirme/düello denemesini
-- sunucu oturumu yazar. Bu tablo kullanıcı×sim×konu başına tek öğrenme kaydı tutar:
-- aynı konu tekrar gönderilirse yeni satır ve yeni XP yoktur (idempotent, hile yüzeyi dar).
-- XP sabit sunucu kuralıdır (`DEFAULT_RULES.xp.learnTopicFirstView`); istemci miktar bildirmez.

-- Up Migration

create table gami_learn (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sim_id text not null,
  topic text not null,
  xp int not null default 0,
  learned_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint gami_learn_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint gami_learn_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint gami_learn_topic_check check (topic ~ '^[a-z0-9][a-z0-9:._-]{0,119}$'),
  constraint gami_learn_xp_check check (xp >= 0),
  constraint gami_learn_user_sim_topic_key unique (user_id, sim_id, topic)
);

create index gami_learn_user_sim_learned_idx on gami_learn (user_id, sim_id, learned_at desc);

-- Down Migration

drop table if exists gami_learn;
