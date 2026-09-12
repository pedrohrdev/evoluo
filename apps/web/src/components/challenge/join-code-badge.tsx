"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { getJoinCode } from "@/lib/api/challenges";
import { useToast } from "@/lib/toast/toast-context";

// Convidar alguém era: copiar 8 caracteres, mandar, e o amigo se cadastrar
// e procurar onde colar. Agora copia o LINK (/join/CODE), que abre uma
// página pública mostrando no que a pessoa está entrando — e usa a Web
// Share API no celular, onde compartilhar é um gesto nativo.
//
// O código continua visível no botão porque quem já está dentro às vezes
// quer ditá-lo, e porque some a dúvida de "que link é esse".
export function JoinCodeBadge({ challengeId }: { challengeId: string }) {
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);

  // Rota própria (etapa 23): o código de convite deixou de vir junto com o
  // desafio, porque o desafio é leitura pública e o código é o único
  // controle de acesso de entrada. Só quem participa consegue lê-lo.
  const { data } = useQuery({
    queryKey: ["challenge-join-code", challengeId],
    queryFn: () => getJoinCode(challengeId),
    staleTime: 5 * 60_000,
  });

  if (!data) return null;

  async function handleShare() {
    const url = `${window.location.origin}/join/${data!.joinCode}`;

    // Share nativo no celular; área de transferência no desktop.
    if (navigator.share) {
      try {
        await navigator.share({ title: "Entra nesse desafio comigo", url });
        return;
      } catch {
        // Cancelar o share do sistema não é erro — cai para o copiar.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      notify("Link de convite copiado!", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Não foi possível copiar. O código é " + data!.joinCode, "info");
    }
  }

  return (
    <button
      onClick={() => void handleShare()}
      className="flex items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 font-display text-xs font-semibold tracking-[0.2em] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      title="Copiar link de convite"
    >
      {data.joinCode}
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Share2 className="size-3.5" aria-hidden />}
    </button>
  );
}
