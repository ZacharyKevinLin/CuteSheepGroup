-- CuteSheepGroup Supabase bootstrap
-- Step 1: Run this file before supabase-schema.sql.

begin;

create extension if not exists pgcrypto;

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

commit;
