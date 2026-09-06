"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { getChallenge } from "@/lib/api/challenges";
import { useToast } from "@/lib/toast/toast-context";

// O código de entrada nunca aparecia em lugar nenhum da interface depois
// de criar o desafio — só existia na resposta da API. Fica visível de
// forma permanente aqui (não só num modal de "sucesso" pontual) porque a
// pessoa pode querer convidar mais alguém dias depois.
export function JoinCodeBadge({ challengeId }: { challengeId: string }) {
  const { notify } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: challenge } = useQuery({
    queryKey: ["challenge", challengeId],
    queryFn: () => getChallenge(challengeId),
    staleTime: 5 * 60_000,
  });

  if (!challenge) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(challenge!.joinCode);
      setCopied(true);
      notify("Código copiado!", "success");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      notify("Não foi possível copiar. Copie manualmente: " + challenge!.joinCode, "info");
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-sm border border-line bg-surface-2 px-2.5 py-1.5 font-display text-xs font-semibold tracking-[0.2em] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      title="Copiar código de convite"
    >
      {challenge.joinCode}
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
    </button>
  );
}
