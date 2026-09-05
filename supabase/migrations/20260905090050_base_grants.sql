-- Privilégios de base que o Supabase já configura automaticamente em todo
-- projeto novo, nas roles `anon`/`authenticated` usadas por PostgREST e
-- pelo Supabase Auth. Declarados aqui explicitamente para que este schema
-- seja reproduzível também fora de um projeto Supabase (ex.: Postgres puro
-- em CI/local) — ver "Migrations" em docs/database-schema.md.
--
-- Isso não abre a porta para escrita livre: é RLS (habilitado tabela a
-- tabela nas migrations seguintes) que decide o que cada role realmente
-- lê/grava linha a linha, e os REVOKE/GRANT por coluna feitos em cada
-- tabela restringem ainda mais o que "authenticated" pode gravar mesmo
-- dentro de uma linha que a policy libera. anon não recebe nenhuma policy
-- em nenhuma tabela — na prática, mesmo com este GRANT de schema, RLS
-- bloqueia tudo para usuários não autenticados.

grant usage on schema public to authenticated, anon;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
