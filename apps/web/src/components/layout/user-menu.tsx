"use client";

import { useQuery } from "@tanstack/react-query";
import { LogOut, Swords, User, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/profile/avatar";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { getOwnDashboard, profileQueryKey } from "@/lib/api/profiles";
import { useAuth } from "@/lib/auth/auth-context";
import { useSound } from "@/lib/sounds/sound-context";

export function UserMenu() {
  const { session, signOut } = useAuth();
  const { enabled, setEnabled } = useSound();
  const router = useRouter();

  // Mesma chave de cache do perfil usada no resto do app (getOwnDashboard,
  // não getProfile: as duas telas do próprio painel já usam essa chave com
  // o bootstrap combinado — usar um queryFn diferente aqui faria as duas
  // brigarem pelo mesmo cache) — normalmente já está quente quando o menu
  // renderiza, então não custa uma requisição.
  const { data: profile } = useQuery({
    queryKey: profileQueryKey(session?.userId ?? ""),
    queryFn: () => getOwnDashboard(),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  if (!session) return null;

  // Antes mostrava a inicial do E-MAIL: quem se chamava "Gustavo" com um
  // e-mail "pedro@..." via um "P" no próprio menu, e a foto de perfil que
  // tinha acabado de subir não aparecia em lugar nenhum do app.
  const displayName = profile?.displayName ?? session.email ?? "?";

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="rounded-full transition-opacity hover:opacity-80"
          aria-label="Menu do usuário"
        >
          <Avatar
            displayName={displayName}
            avatarUrl={profile?.avatarUrl}
            className="size-9"
            textClassName="text-sm"
          />
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem asChild>
          <Link href={`/profiles/${session.userId}`}>
            <User className="size-4" aria-hidden />
            Meu perfil
          </Link>
        </DropdownItem>
        {/* /onboarding agora entra direto no painel do desafio mais ativo
            (pedido do usuário) — ?all=1 pula esse redirect pra deixar
            trocar de desafio ou criar/entrar em outro. */}
        <DropdownItem asChild>
          <Link href="/onboarding?all=1">
            <Swords className="size-4" aria-hidden />
            Meus desafios
          </Link>
        </DropdownItem>
        <DropdownItem onSelect={(e) => e.preventDefault()} onClick={() => setEnabled(!enabled)}>
          {enabled ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          {enabled ? "Sons ativados" : "Sons desativados"}
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          onClick={() => {
            void signOut().then(() => router.replace("/login"));
          }}
        >
          <LogOut className="size-4" aria-hidden />
          Sair
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
