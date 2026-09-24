-- T61 — E3 §c: toplu içe aktarma staging tabloları. Ham CSV satırı import_rows
-- içinde jsonb olarak kısa süre tutulur; imha işi süresi geçen satırları siler,
-- batch sayaçları ve denetim kaydı kalır. Kişisel veri yalnız bu staging
-- tablolarında ve users kaydındadır.

-- Up Migration

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null,
  uploaded_by uuid not null,
  file_name text not null,
  mode text not null,
  status text not null,
  template_version text not null,
  row_count int not null default 0,
  valid_count int not null default 0,
  error_count int not null default 0,
  applied_count int not null default 0,
  created_at timestamptz,
  validated_at timestamptz,
  applied_at timestamptz,
  expires_at timestamptz,
  constraint import_batches_institution_id_fkey foreign key (institution_id) references institutions (id),
  constraint import_batches_uploaded_by_fkey foreign key (uploaded_by) references users (id),
  constraint import_batches_file_name_length_check check (char_length(file_name) between 1 and 200),
  constraint import_batches_mode_check check (mode in ('ekle', 'guncelle')),
  constraint import_batches_status_check check (status in ('uploaded', 'validated', 'applied', 'failed', 'expired'))
);

create index import_batches_institution_created_idx on import_batches (institution_id, created_at desc);
create index import_batches_status_expires_idx on import_batches (status, expires_at);

create table import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  row_no int not null,
  raw jsonb not null,
  normalized jsonb,
  status text not null,
  errors jsonb,
  matched_user_id uuid,
  created_at timestamptz,
  applied_at timestamptz,
  constraint import_rows_batch_id_fkey foreign key (batch_id) references import_batches (id) on delete cascade,
  constraint import_rows_matched_user_id_fkey foreign key (matched_user_id) references users (id),
  constraint import_rows_status_check check (status in ('valid', 'error', 'applied', 'skipped')),
  constraint import_rows_batch_row_key unique (batch_id, row_no)
);

create index import_rows_batch_status_idx on import_rows (batch_id, status);

-- Down Migration

drop table if exists import_rows;
drop table if exists import_batches;
