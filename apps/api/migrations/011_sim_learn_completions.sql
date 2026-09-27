-- Öğrenme tamamlama kaydı (depo sahibi kararı, 27 Eylül 2026): üç simde de
-- öğrenme modu bitmeden uygulama/değerlendirme ve meydan okuma (oluşturma ve
-- katılma) kilitlidir. "Öğrenme bitti" tespitini sim paketleri yapar; bu tablo
-- yalnız "kullanıcı bu simin öğrenme içeriğinin tamamını gördü" kaydını tutar.
-- `content_version` görülen içerik sürümüdür: yeniden tamamlamada ilk
-- `completed_at` korunur, yalnız sürüm güncellenir.

-- Up Migration

create table sim_learn_completions (
  user_id uuid not null,
  sim_id text not null,
  completed_at timestamptz not null,
  content_version text not null,
  constraint sim_learn_completions_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint sim_learn_completions_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint sim_learn_completions_content_version_check check (content_version ~ '^[a-z0-9._-]{1,40}$'),
  constraint sim_learn_completions_pkey primary key (user_id, sim_id)
);

-- Down Migration

drop table if exists sim_learn_completions;
