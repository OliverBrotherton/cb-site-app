-- Chas Berger Site App: database setup.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists pms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  pin text not null unique,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pm_email text not null default '',
  pin text not null unique,
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

-- Added later: which project manager runs each project
alter table projects add column if not exists pm_id uuid references pms(id) on delete set null;

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

-- Added later: asbestos survey check on each address
alter table properties add column if not exists asb_status text not null default 'Not checked';
alter table properties add column if not exists asb_type text not null default '';
alter table properties add column if not exists asb_ref text not null default '';
alter table properties add column if not exists asb_date text not null default '';
alter table properties add column if not exists asb_notes text not null default '';
alter table properties add column if not exists asb_impact text not null default '';
alter table properties add column if not exists asb_docs text[] not null default '{}';
alter table properties add column if not exists asb_checked_by text not null default '';
alter table properties add column if not exists asb_checked_at bigint;

-- Added later: scaffold strike call-offs
create table if not exists scaffolds (
  id uuid primary key default gen_random_uuid(),
  ref_no bigint generated always as identity,
  property_id uuid not null references properties(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  strike_date text not null,
  notes text not null default '',
  checks text[] not null default '{}',
  photos text[] not null default '{}',
  status text not null default 'requested',
  confirmed_date text not null default '',
  confirmed_at bigint,
  scaff_note text not null default '',
  struck_at bigint,
  struck_by text not null default '',
  struck_photos text[] not null default '{}',
  requested_by text not null default '',
  requested_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  email_status text not null default 'none',
  email_error text not null default '',
  emailed_at bigint,
  emailed_to text not null default ''
);

-- Added later: the site manager who raised a snag or call-off gets copied into its emails
alter table snags add column if not exists raised_by_email text not null default '';
alter table scaffolds add column if not exists requested_by_email text not null default '';

-- Added later: automatic chase emails for missed snags and scaffold strikes
alter table snags add column if not exists chase_count integer not null default 0;
alter table snags add column if not exists last_chased text not null default '';
alter table scaffolds add column if not exists chase_count integer not null default 0;
alter table scaffolds add column if not exists last_chased text not null default '';

-- Added later: each project's own works tracker answers on every address
alter table properties add column if not exists tracker jsonb not null default '{}';
alter table properties add column if not exists tracker_updated_at bigint;
alter table properties add column if not exists tracker_updated_by text not null default '';

-- Added later: scaffold call-offs to go up as well as come down, with the handover certificate
alter table scaffolds add column if not exists kind text not null default 'strike';
alter table scaffolds add column if not exists cert_docs text[] not null default '{}';

-- Added later: delays on each address
create table if not exists delays (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  reason text not null,
  cause text not null default '',
  started text not null,
  ended text not null default '',
  notes text not null default '',
  photos text[] not null default '{}',
  status text not null default 'open',
  logged_by text not null default '',
  logged_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  resolved_by text not null default '',
  resolved_at bigint
);

-- Added later: app-wide settings, e.g. survey questions uploaded by the admin
create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}',
  updated_at bigint,
  updated_by text not null default ''
);

create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  at bigint not null
);

create index if not exists projects_pm on projects(pm_id);
create index if not exists properties_project on properties(project_id);
create index if not exists snags_property on snags(property_id);
create index if not exists snags_contractor on snags(contractor_id);
create index if not exists surveys_property on surveys(property_id);
create index if not exists scaffolds_property on scaffolds(property_id);
create index if not exists scaffolds_contractor on scaffolds(contractor_id);
create index if not exists delays_property on delays(property_id);
create index if not exists login_attempts_ip on login_attempts(ip, at);

-- Lock every table: only the app's server (using the secret service key) can read or write.
alter table pms enable row level security;
alter table projects enable row level security;
alter table contractors enable row level security;
alter table properties enable row level security;
alter table surveys enable row level security;
alter table snags enable row level security;
alter table scaffolds enable row level security;
alter table delays enable row level security;
alter table settings enable row level security;
alter table login_attempts enable row level security;

-- Private bucket for photos (only the app's server can read it)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Make the app see any new tables and columns straight away
notify pgrst, 'reload schema';
