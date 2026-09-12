-- Etapa 28 — notificações push.
--
-- O lembrete de check-in nasceu como e-mail (etapa 25) e foi corrigido para
-- push por decisão do usuário: um produto de streak precisa avisar antes da
-- meia-noite, e ninguém abre e-mail nessa hora. Web Push aparece na tela
-- como qualquer outra notificação do celular.
--
-- Cada linha é UM navegador/dispositivo de um usuário — a mesma pessoa pode
-- ter várias (celular, desktop). O `endpoint` é a URL que o serviço de push
-- do navegador (FCM, Mozilla, Apple) devolve; é ele que identifica a
-- inscrição de forma única, daí ser a chave natural.
--
-- `p256dh` e `auth` são as chaves de criptografia que o navegador gera: o
-- servidor cifra a mensagem com elas, então nem o serviço de push
-- intermediário consegue ler o conteúdo.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  -- Atualizado a cada envio bem-sucedido; serve para depurar "não recebi
  -- nada" sem precisar de log externo.
  last_used_at timestamptz
);

comment on table push_subscriptions is 'Uma inscrição de Web Push por navegador/dispositivo. Removida automaticamente quando o serviço de push responde 404/410 (inscrição expirada) — ver PushService.';

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Diferente de todo o resto do schema, isto NÃO é leitura pública: a
-- inscrição de push de alguém é um identificador de dispositivo, não um
-- dado de perfil. Cada usuário só enxerga e apaga as próprias.
create policy push_subscriptions_select_own
  on push_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

revoke insert on push_subscriptions from authenticated;
grant insert (user_id, endpoint, p256dh, auth) on push_subscriptions to authenticated;

create policy push_subscriptions_insert_own
  on push_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

create policy push_subscriptions_delete_own
  on push_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

-- `last_used_at` só é escrito pelo backend (que conecta como postgres);
-- authenticated não recebe grant de update em coluna nenhuma.
