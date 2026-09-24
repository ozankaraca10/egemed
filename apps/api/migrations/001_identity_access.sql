-- T61 — E3 §c: kimlik ve erişim şeması (kurum, birim, kullanıcı, rol, sim
-- erişimi, oturum). Kimlikler gen_random_uuid() ile üretilir; zamanlar
-- timestamptz ve UTC saklanır. Numaralandırmalar native enum değil text + CHECK
-- olarak tutulur (migration kolaylığı); kısıt adları açık yazılır. Yumuşak silme
-- deleted_at iledir; benzersizlik kısmi indekslerle yalnız yaşayan satırlara
-- uygulanır. institutions/units yalnız sınıflandırma ve filtre amaçlıdır; yetki
-- kapsamı değildir (tek kurum varsayımı).

-- Up Migration

create table institutions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint institutions_code_format_check check (code ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  constraint institutions_name_length_check check (char_length(name) between 2 and 200),
  constraint institutions_status_check check (status in ('active', 'archived')),
  constraint institutions_code_key unique (code)
);

create index institutions_status_idx on institutions (status);

create table units (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  parent_id uuid,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint units_institution_id_fkey foreign key (institution_id) references institutions (id) on delete restrict,
  constraint units_parent_id_fkey foreign key (parent_id) references units (id) on delete restrict,
  constraint units_code_format_check check (code ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  constraint units_name_length_check check (char_length(name) between 2 and 200)
);

create unique index units_institution_code_key on units (institution_id, code) where deleted_at is null;
create index units_institution_parent_idx on units (institution_id, parent_id);

create table users (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  unit_id uuid,
  username text,
  email text,
  display_name text not null,
  auth_method text not null,
  sso_subject text,
  status text not null default 'invited',
  xapi_actor_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  deleted_at timestamptz,
  constraint users_institution_id_fkey foreign key (institution_id) references institutions (id),
  constraint users_unit_id_fkey foreign key (unit_id) references units (id),
  constraint users_username_format_check check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  constraint users_display_name_length_check check (char_length(display_name) between 2 and 120),
  constraint users_auth_method_check check (auth_method in ('sso', 'dev')),
  constraint users_status_check check (status in ('invited', 'active', 'suspended', 'deleted')),
  constraint users_xapi_actor_id_format_check check (xapi_actor_id ~ '^[A-Za-z0-9._:-]{8,128}$'),
  constraint users_mapping_key_check check (username is not null or email is not null),
  constraint users_deleted_at_check check (status <> 'deleted' or deleted_at is not null),
  constraint users_xapi_actor_id_key unique (xapi_actor_id)
);

create unique index users_institution_username_key on users (institution_id, lower(username)) where deleted_at is null;
create unique index users_institution_email_key on users (institution_id, lower(email)) where deleted_at is null;
create unique index users_institution_sso_subject_key on users (institution_id, sso_subject) where sso_subject is not null;
create index users_institution_status_idx on users (institution_id, status);
create index users_institution_unit_idx on users (institution_id, unit_id);
create index users_last_login_at_idx on users (last_login_at);

create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  constraint user_roles_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint user_roles_granted_by_fkey foreign key (granted_by) references users (id),
  constraint user_roles_role_check check (role in ('admin', 'kullanici')),
  constraint user_roles_user_role_key unique (user_id, role)
);

create index user_roles_user_id_idx on user_roles (user_id);
create index user_roles_role_idx on user_roles (role);

create table sim_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  sim_id text not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  constraint sim_access_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint sim_access_granted_by_fkey foreign key (granted_by) references users (id),
  constraint sim_access_sim_id_check check (sim_id in ('pulse', 'ausculta', 'opaca')),
  constraint sim_access_user_sim_key unique (user_id, sim_id)
);

create table sessions (
  id uuid primary key,
  user_id uuid not null,
  auth_method text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint sessions_user_id_fkey foreign key (user_id) references users (id) on delete cascade,
  constraint sessions_auth_method_check check (auth_method in ('sso', 'dev'))
);

create index sessions_user_id_idx on sessions (user_id);
create index sessions_expires_at_idx on sessions (expires_at);

-- Down Migration

drop table if exists sessions;
drop table if exists sim_access;
drop table if exists user_roles;
drop table if exists users;
drop table if exists units;
drop table if exists institutions;
