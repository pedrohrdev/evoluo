-- Bucket público para foto de perfil (profiles.avatar_url, já existente
-- desde 20260905090200_profiles.sql). Só o NestJS escreve aqui — via
-- SupabaseService.adminClient (service role, bypassa RLS, mesmo padrão de
-- confiança já usado pelo resto do backend) em ProfilesService.uploadAvatar
-- — nunca o client anon/authenticated do Supabase, que o frontend nem usa
-- (docs/arquitetura-tecnica.md: NestJS é a única porta de entrada).
--
-- file_size_limit e allowed_mime_types espelham as constantes
-- MAX_AVATAR_SIZE_BYTES (profiles.controller.ts) e ALLOWED_AVATAR_MIME_TYPES
-- (profiles.service.ts) — mantenha os três em sincronia se algum mudar.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Leitura pública de verdade (perfis são públicos, CLAUDE.md seção 2) —
-- redundante com o bucket já sendo `public` (que serve via CDN sem passar
-- por RLS), mas mantém a mesma defesa em profundidade usada em toda tabela
-- deste projeto, caso algo um dia liste storage.objects via PostgREST.
create policy avatars_select_public
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Sem nenhuma policy de insert/update/delete para anon/authenticated: só o
-- service role (que ignora RLS) grava neste bucket, através do NestJS.
