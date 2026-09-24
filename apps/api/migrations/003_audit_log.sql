-- T61 — E3 §c: denetim günlüğü. append-only iki katmanda korunur:
-- (1) Yetki: uygulama rolünün adı yapılandırmadan gelir ve bu migration rol adını
--     sabitlemez. Dağıtımda uygulama rolüne UPDATE veya DELETE yetkisi VERİLMEZ;
--     yalnız INSERT ve SELECT için yetki tanımlanır.
-- (2) DB güvencesi: rol yanlış yapılandırılsa veya bir SQL enjeksiyonu olsa bile
--     kaydı değiştirmek/silmek mümkün değildir; audit_log üzerindeki BEFORE
--     UPDATE OR DELETE OR TRUNCATE tetikleyicisi her girişimi 'P0010' SQLSTATE'i
--     ile reddeder. İmha işi (§c) audit kaydını silmez; bu yüzden istisna yoktur.
-- Özet alanları yalnız summary_before/summary_after taşır; sır, parola, ham yanıt
-- ve ifade yazılmaz.

-- Up Migration

create table audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_role text,
  institution_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  summary_before jsonb,
  summary_after jsonb,
  request_id text,
  constraint audit_log_actor_user_id_fkey foreign key (actor_user_id) references users (id),
  constraint audit_log_institution_id_fkey foreign key (institution_id) references institutions (id)
);

create index audit_log_institution_occurred_idx on audit_log (institution_id, occurred_at desc);
create index audit_log_target_idx on audit_log (target_type, target_id, occurred_at desc);
create index audit_log_actor_idx on audit_log (actor_user_id, occurred_at desc);

-- Rol-bağımsız append-only zorlaması; 'P0010' yalnız bu ihlal için tanımlıdır.
create function audit_log_append_only() returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log append-only'
    using errcode = 'P0010',
          hint = 'Denetim kaydı yalnız INSERT ile büyür; UPDATE, DELETE ve TRUNCATE yasaktır.';
end;
$$;

create trigger audit_log_append_only
  before update or delete or truncate on audit_log
  for each statement
  execute function audit_log_append_only();

-- Down Migration

drop trigger if exists audit_log_append_only on audit_log;
drop function if exists audit_log_append_only();
drop table if exists audit_log;
