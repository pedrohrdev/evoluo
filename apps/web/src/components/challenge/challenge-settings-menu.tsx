"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { deleteChallenge, getChallenge } from "@/lib/api/challenges";
import { profileQueryKey } from "@/lib/api/profiles";
import { useAuth } from "@/lib/auth/auth-context";
import { useToast } from "@/lib/toast/toast-context";

// Só o criador do desafio vê este menu — hard-delete total, confirmado com
// o usuário: apaga o desafio inteiro (histórico, pontos e streaks de TODOS
// os participantes, não só do criador), sem volta. Por isso exige digitar
// o nome do desafio antes de habilitar o botão, em vez de um único clique.
export function ChallengeSettingsMenu({ challengeId }: { challengeId: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Mesma queryKey de JoinCodeBadge — reaproveita o cache, não duplica a
  // busca do mesmo desafio.
  const { data: challenge } = useQuery({
    queryKey: ["challenge", challengeId],
    queryFn: () => getChallenge(challengeId),
    staleTime: 5 * 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteChallenge(challengeId),
    onSuccess: () => {
      notify("Desafio deletado.", "success");
      if (session) void queryClient.invalidateQueries({ queryKey: profileQueryKey(session.userId) });
      router.replace("/onboarding");
    },
    onError: () => notify("Não foi possível deletar o desafio.", "danger"),
  });

  if (!challenge || !session || challenge.createdBy !== session.userId) {
    return null;
  }

  const canConfirm = confirmText.trim() === challenge.name;

  return (
    <>
      <Dropdown>
        <DropdownTrigger asChild>
          <button
            className="flex size-9 items-center justify-center rounded-full bg-surface-3 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Configurações do desafio"
          >
            <Settings className="size-4" aria-hidden />
          </button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownItem
            className="text-danger data-[highlighted]:bg-danger-soft"
            onSelect={(event) => {
              event.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            Deletar desafio
          </DropdownItem>
        </DropdownContent>
      </Dropdown>

      <Modal
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setConfirmText("");
        }}
        title="Deletar desafio"
        description="Apaga o desafio para sempre — histórico, pontos e streaks de TODOS os participantes somem junto, não só os seus. Não tem como desfazer."
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Para confirmar, digite o nome do desafio: <span className="font-semibold text-ink">{challenge.name}</span>
          </p>
          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={challenge.name}
            autoFocus
          />
          <Button
            variant="danger"
            disabled={!canConfirm}
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Deletar para sempre
          </Button>
        </div>
      </Modal>
    </>
  );
}
