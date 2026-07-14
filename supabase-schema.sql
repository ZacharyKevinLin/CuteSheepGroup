-- CuteSheepGroup cloud database schema
-- Execute this file once in Supabase Dashboard -> SQL Editor.
-- This script creates the shared tables and database-level access controls.

begin;

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared helper functions
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Returns the signed-in member profile id.
create or replace function public.my_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

-- Returns the signed-in member role.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() in ('小組長','副組長','小組員'), false);
$$;

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() = '小組長', false);
$$;

create or replace function public.is_leader_or_deputy()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() in ('小組長','副組長'), false);
$$;

-- -----------------------------------------------------------------------------
-- Member accounts and profiles
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  login_key text unique not null,
  display_name text not null,
  role text not null default '小組員'
    check (role in ('小組長','副組長','小組員','已離開')),
  birthday date,
  must_change_password boolean not null default true,
  joined_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  gender text,
  job text,
  location text,
  relationship_status text,
  relationship_note text,
  faith_status text,
  faith_note text,
  faith_generation text,
  baptism_date date,
  service_status text,
  service_detail text,
  service_note text,
  devotion_status text,
  devotion_note text,
  prayer_life_status text,
  prayer_life_note text,
  meeting_stability text,
  meeting_stability_note text,
  bible_status text,
  bible_note text,
  hunger_status text,
  hunger_note text,
  spiritual_state text,
  spiritual_state_note text,
  family_relationship text,
  family_relationship_note text,
  interpersonal_relationship text,
  interpersonal_relationship_note text,
  wellbeing text,
  wellbeing_note text,
  pressure_sources jsonb not null default '[]'::jsonb,
  temptations jsonb not null default '[]'::jsonb,
  breakthroughs jsonb not null default '[]'::jsonb,
  stuck_points jsonb not null default '[]'::jsonb,
  next_interview date,
  updated_at timestamptz not null default now()
);

-- Highly private notes are isolated so deputy leaders cannot read them.
create table if not exists public.member_private_notes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  note text,
  updated_at timestamptz not null default now()
);

-- Prevent a normal member from changing identity or role through a direct API call.
create or replace function public.protect_profile_admin_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_leader() then
    new.id := old.id;
    new.auth_user_id := old.auth_user_id;
    new.login_key := old.login_key;
    new.role := old.role;
    new.must_change_password := old.must_change_password;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_admin_fields on public.profiles;
create trigger profiles_protect_admin_fields
before update on public.profiles
for each row execute function public.protect_profile_admin_fields();

-- -----------------------------------------------------------------------------
-- Meetings, attendance and prayers
-- -----------------------------------------------------------------------------

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  meeting_type text not null default '實體聚會',
  custom_type text,
  topic text,
  location text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default '出席'
    check (status in ('出席','請假','未到','新朋友')),
  updated_at timestamptz not null default now(),
  unique (meeting_id, profile_id)
);

create table if not exists public.prayer_records (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references public.meetings(id) on delete set null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  interview_date date not null,
  summary text,
  private_note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Configurable permissions and dropdown options
-- -----------------------------------------------------------------------------

create table if not exists public.role_permissions (
  role text not null check (role in ('小組長','副組長','小組員','已離開')),
  resource text not null,
  can_read boolean not null default false,
  can_write boolean not null default false,
  primary key (role, resource)
);

create table if not exists public.option_settings (
  id uuid primary key default gen_random_uuid(),
  field_key text not null,
  option_label text not null,
  internal_weight numeric not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_key, option_label)
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles','member_details','member_private_notes','meetings','attendance',
    'prayer_records','interviews','option_settings'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.member_details enable row level security;
alter table public.member_private_notes enable row level security;
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;
alter table public.prayer_records enable row level security;
alter table public.interviews enable row level security;
alter table public.role_permissions enable row level security;
alter table public.option_settings enable row level security;

-- Profiles: leaders/deputies may view all; members may view only themselves.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select to authenticated
using (
  public.is_leader_or_deputy()
  or id = public.my_profile_id()
);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert to authenticated
with check (public.is_leader());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update to authenticated
using (public.is_leader() or id = public.my_profile_id())
with check (public.is_leader() or id = public.my_profile_id());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
for delete to authenticated
using (public.is_leader());

-- Member details: leader/deputy all; member self only.
drop policy if exists member_details_select on public.member_details;
create policy member_details_select on public.member_details
for select to authenticated
using (public.is_leader_or_deputy() or profile_id = public.my_profile_id());

drop policy if exists member_details_insert on public.member_details;
create policy member_details_insert on public.member_details
for insert to authenticated
with check (public.is_leader_or_deputy() or profile_id = public.my_profile_id());

drop policy if exists member_details_update on public.member_details;
create policy member_details_update on public.member_details
for update to authenticated
using (public.is_leader_or_deputy() or profile_id = public.my_profile_id())
with check (public.is_leader_or_deputy() or profile_id = public.my_profile_id());

drop policy if exists member_details_delete on public.member_details;
create policy member_details_delete on public.member_details
for delete to authenticated
using (public.is_leader());

-- Private notes: only the leader and the member themself.
drop policy if exists private_notes_select on public.member_private_notes;
create policy private_notes_select on public.member_private_notes
for select to authenticated
using (public.is_leader() or profile_id = public.my_profile_id());

drop policy if exists private_notes_write on public.member_private_notes;
create policy private_notes_write on public.member_private_notes
for all to authenticated
using (public.is_leader() or profile_id = public.my_profile_id())
with check (public.is_leader() or profile_id = public.my_profile_id());

-- Meetings: active members can read; leader/deputy can write.
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
for select to authenticated
using (public.is_active_member());

drop policy if exists meetings_write on public.meetings;
create policy meetings_write on public.meetings
for all to authenticated
using (public.is_leader_or_deputy())
with check (public.is_leader_or_deputy());

-- Attendance: active members can read; leader/deputy can write.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
for select to authenticated
using (public.is_active_member());

drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance
for all to authenticated
using (public.is_leader_or_deputy())
with check (public.is_leader_or_deputy());

-- Prayer records: leader/deputy can read all; member can read/write self only.
drop policy if exists prayers_select on public.prayer_records;
create policy prayers_select on public.prayer_records
for select to authenticated
using (public.is_leader_or_deputy() or profile_id = public.my_profile_id());

drop policy if exists prayers_insert on public.prayer_records;
create policy prayers_insert on public.prayer_records
for insert to authenticated
with check (public.is_leader_or_deputy() or profile_id = public.my_profile_id());

drop policy if exists prayers_update on public.prayer_records;
create policy prayers_update on public.prayer_records
for update to authenticated
using (public.is_leader_or_deputy() or profile_id = public.my_profile_id())
with check (public.is_leader_or_deputy() or profile_id = public.my_profile_id());

drop policy if exists prayers_delete on public.prayer_records;
create policy prayers_delete on public.prayer_records
for delete to authenticated
using (public.is_leader() or profile_id = public.my_profile_id());

-- Interviews: leader and the member themself only; deputy cannot read private interviews.
drop policy if exists interviews_select on public.interviews;
create policy interviews_select on public.interviews
for select to authenticated
using (public.is_leader() or profile_id = public.my_profile_id());

drop policy if exists interviews_write on public.interviews;
create policy interviews_write on public.interviews
for all to authenticated
using (public.is_leader())
with check (public.is_leader());

-- Settings: active users can read; only leader can modify.
drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
for select to authenticated
using (public.is_active_member());

drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions
for all to authenticated
using (public.is_leader())
with check (public.is_leader());

drop policy if exists option_settings_select on public.option_settings;
create policy option_settings_select on public.option_settings
for select to authenticated
using (public.is_active_member());

drop policy if exists option_settings_write on public.option_settings;
create policy option_settings_write on public.option_settings
for all to authenticated
using (public.is_leader())
with check (public.is_leader());

-- -----------------------------------------------------------------------------
-- Initial role permissions
-- -----------------------------------------------------------------------------

insert into public.role_permissions (role, resource, can_read, can_write)
values
  ('小組長','dashboard',true,true),
  ('小組長','members',true,true),
  ('小組長','meetings',true,true),
  ('小組長','prayers',true,true),
  ('小組長','interviews',true,true),
  ('小組長','analysis',true,true),
  ('小組長','settings',true,true),
  ('副組長','dashboard',true,false),
  ('副組長','members',true,true),
  ('副組長','meetings',true,true),
  ('副組長','prayers',true,true),
  ('副組長','interviews',false,false),
  ('副組長','analysis',true,false),
  ('副組長','settings',false,false),
  ('小組員','dashboard',true,false),
  ('小組員','members',true,true),
  ('小組員','meetings',true,false),
  ('小組員','prayers',true,true),
  ('小組員','interviews',true,false),
  ('小組員','analysis',false,false),
  ('小組員','settings',true,false),
  ('已離開','dashboard',false,false),
  ('已離開','members',false,false),
  ('已離開','meetings',false,false),
  ('已離開','prayers',false,false),
  ('已離開','interviews',false,false),
  ('已離開','analysis',false,false),
  ('已離開','settings',false,false)
on conflict (role, resource) do update
set can_read = excluded.can_read,
    can_write = excluded.can_write;

commit;
