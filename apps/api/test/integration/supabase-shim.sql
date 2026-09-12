-- Reproduz, num Postgres puro, o mínimo do ambiente Supabase de que as
-- migrations dependem. Nada aqui vai para produção: é só o andaime que
-- permite rodar `supabase/migrations/*.sql` numa base de teste descartável.
--
-- O que o Supabase fornece e um Postgres cru não:
--   - as roles `anon` / `authenticated` / `service_role`;
--   - o schema `auth` com a tabela `users` e a função `auth.uid()`;
--   - o schema `storage` com `buckets`/`objects`;
--   - a extensão `pg_cron` (aqui substituída por um stub, porque agendar de
--     verdade não faz sentido num teste — o que importa é que as funções de
--     fechamento existam e possam ser chamadas à mão).

create extension if not exists pgcrypto;

-- Roles usadas pelas policies. `nologin` porque os testes conectam como
-- superusuário e só precisam que os GRANT/REVOKE das migrations resolvam.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

-- Só as colunas que as migrations tocam: o trigger handle_new_user lê
-- `raw_user_meta_data` e `email`, e várias FKs apontam para `id`.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz not null default now()
);

-- No Supabase, auth.uid() lê o `sub` do JWT que o PostgREST põe em
-- `request.jwt.claims`. Aqui uma GUC simples cumpre o mesmo papel: os
-- testes que exercitam RLS fazem `set local app.test_user_id = '...'`.
create or replace function auth.uid() returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.test_user_id', true), '')::uuid;
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Stub de pg_cron. A extensão real não roda num Postgres comum, e o
-- agendamento em si não é o que os testes verificam — o que importa é que
-- `cron.schedule(...)` não exploda quando a migration de fechamento rodar,
-- e que dê para inspecionar o que FOI agendado.
create schema if not exists cron;

create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text not null,
  command text not null
);

create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (p_name, p_schedule, p_command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v_id;
  return v_id;
end;
$$;

create or replace function cron.unschedule(p_name text) returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobname = p_name;
  return true;
end;
$$;
