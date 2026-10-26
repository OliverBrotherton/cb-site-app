-- Chas Berger Site App: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pm_email text not null default '',
  pin text not null unique,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists contractors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  email text not null,
  trade text not null default '',
  token text not null unique,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete set null,
  ref text not null default '',
  address text not null,
  postcode text not null default '',
  works text[] not null default '{}',
  status text not null default 'To survey',
  notes text not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  type text not null,
  answers jsonb not null default '{}',
  photos jsonb not null default '{}',
  status text not null default 'draft',
  by_name text not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  submitted_at bigint
);

create table if not exists snags (
  id uuid primary key default gen_random_uuid(),
  ref_no bigint generated always as identity,
  property_id uuid not null references properties(id) on delete cascade,
  contractor_id uuid references contractors(id) on delete set null,
  title text not null,
  location text not null default '',
  trade text not null default '',
  priority text not null default 'Medium',
  due text not null default '',
  notes text not null default '',
  photos text[] not null default '{}',
  fix_photos text[] not null default '{}',
  fix_note text not null default '',
  status text not null default 'open',
  reopen_reason text not null default '',
  raised_by text not null default '',
  raised_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  fixed_at bigint,
  fixed_by text not null default '',
  closed_at bigint,
  closed_by text not null default '',
  email_status text not null default 'none',
  email_error text not null default '',
  emailed_at bigint,
  emailed_to text not null default ''
);

create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  at bigint not null
);

create index if not exists properties_project on properties(project_id);
create index if not exists snags_property on snags(property_id);
create index if not exists snags_contractor on snags(contractor_id);
create index if not exists surveys_property on surveys(property_id);
create index if not exists login_attempts_ip on login_attempts(ip, at);

-- Lock every table: only the app's server (using the secret service key) can read or write.
alter table projects enable row level security;
alter table contractors enable row level security;
alter table properties enable row level security;
alter table surveys enable row level security;
alter table snags enable row level security;
alter table login_attempts enable row level security;

-- Private bucket for photos (only the app's server can read it)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;
