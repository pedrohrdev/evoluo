"use client";

import { LogOut, User, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { useAuth } from "@/lib/auth/auth-context";
import { useSound } from "@/lib/sounds/sound-context";

export function UserMenu() {
  const { session, signOut } = useAuth();
  const { enabled, setEnabled } = useSound();
  const router = useRouter();

  if (!session) return null;

  const initial = (session.email ?? "?").charAt(0).toUpperCase();

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          className="flex size-9 items-center justify-center rounded-full bg-surface-3 font-display text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
          aria-label="Menu do usuário"
        >
          {initial}
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem asChild>
          <Link href={`/profiles/${session.userId}`}>
            <User className="size-4" aria-hidden />
            Meu perfil
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
