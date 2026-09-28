-- T221 — Meydan Okuma rozetleri: düello sonucu kalıcıdır. İki taraf da
-- bitirdiğinde kazanan (`winner_id`; beraberlikte null) ve bitiş anı yazılır.
-- Düello rozetleri yalnız bu sonuçlardan türetilir (deneme özetinden değil);
-- ham öğrenci yanıtı içermez.

-- Up Migration

alter table challenges
  add column winner_id uuid,
  add column finished_at timestamptz,
  add constraint challenges_winner_id_fkey foreign key (winner_id) references users (id) on delete set null;

create index challenges_finished_idx on challenges (sim_id, status, finished_at) where finished_at is not null;

-- Down Migration

drop index if exists challenges_finished_idx;
alter table challenges
  drop constraint if exists challenges_winner_id_fkey,
  drop column if exists finished_at,
  drop column if exists winner_id;
