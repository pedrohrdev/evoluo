-- Extensões necessárias
-- pgcrypto: gen_random_uuid() para chaves primárias, gen_random_bytes() usado indiretamente no gerador de código de convite
-- pg_cron: agendamento dos jobs de fechamento de período (streak, pontuação) — seção "Fechamento de período" do docs/database-schema.md
--
-- No Supabase, pg_cron normalmente precisa ser habilitado uma vez pelo dashboard
-- (Database > Extensions > pg_cron) antes que este "create extension" funcione,
-- porque a extensão exige carregamento via shared_preload_libraries no servidor.
-- Se este comando falhar ao rodar `supabase db push`, habilite pg_cron pelo
-- dashboard primeiro e rode a migration novamente.
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
