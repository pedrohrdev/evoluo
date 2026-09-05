-- Perfil público de cada usuário. auth.users (gerenciada pelo Supabase Auth)
-- guarda credenciais; profiles guarda os dados de app que fazem sentido expor.
--
-- Decisão confirmada (docs/arquitetura-tecnica.md, seção 2): o perfil é
-- público para qualquer usuário autenticado no app, mesmo fora de um
-- desafio em comum.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Dados públicos de perfil, 1:1 com auth.users. Populada automaticamente na criação da conta (trigger handle_new_user).';

-- Cria o profile automaticamente quando um usuário se cadastra via Supabase Auth.
-- Sem isso, todo signup exigiria uma segunda escrita coordenada pelo backend.
create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger trg_handle_new_user
after insert on auth.users
for each row execute function handle_new_user();

alter table profiles enable row level security;

-- Leitura pública dentro do app (qualquer usuário autenticado).
create policy profiles_select_authenticated
  on profiles for select
  to authenticated
  using (true);

-- Cada usuário só edita o próprio perfil, e só os campos de apresentação
-- (id nunca é editável — é a própria FK para auth.users).
revoke update on profiles from authenticated;
grant update (display_name, avatar_url) on profiles to authenticated;

create policy profiles_update_own
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Não há policy de insert/delete para authenticated: o único caminho de
-- criação é o trigger handle_new_user (security definer, roda como owner).
