-- Liderlik tablosuna katılım tercihi (depo sahibi kararı, 24 Eylül 2026).
-- false: kullanıcı başkalarının liderlik listelerinde görünmez; kendi satırını
-- ve kendi sıralama özetini görmeye devam eder. Tercih kullanıcıya aittir ve
-- üç simde ortaktır.

-- Up Migration

alter table users
  add column leaderboard_visible boolean not null default true;

-- Down Migration

alter table users
  drop column if exists leaderboard_visible;
