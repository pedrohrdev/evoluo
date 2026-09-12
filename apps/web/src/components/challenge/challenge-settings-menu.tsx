"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DoorOpen, Settings, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { deleteChallenge, getChallenge, leaveChallenge } from "@/lib/api/challenges";
import { profileQueryKey } from "@/lib/api/profiles";
import { useAuth } from "@/lib/auth/auth-context";
import { useToast } from "@/lib/toast/toast-context";

// Duas ações bem diferentes, deliberadamente separadas na interface:
//
//   Sair do desafio — qualquer participante. Marca o vínculo como inativo:
//   some do ranking ativo e não dá mais para registrar, mas histórico,
//   pontos e streaks continuam intactos no perfil (CLAUDE.md seção 2).
//   Reversível pelo lado do produto (dá para entrar de novo com o código).
//
//   Deletar o desafio — só o criador. Hard-delete total: apaga histórico,
//   pontos e streaks de TODOS os participantes, sem volta. Por isso exige
//   digitar o nome do desafio, em vez de um único clique.
export function ChallengeSettingsMenu({ challengeId }: { challengeId: string }) {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Mesma queryKey de JoinCodeBadge — reaproveita o cache, não duplica a
  // busca do mesmo desafio.
  const { data: challenge } = useQuery({
    queryKey: ["challenge", challengeId],
    queryFn: () => getChallenge(challengeId),
    staleTime: 5 * 60_000,
  });

  const leaveMutation = useMutation({
    mutationFn: () => leaveChallenge(challengeId),
    onSuccess: () => {
      notify("Você saiu do desafio. Seu histórico continua no seu perfil.", "success");
      if (session) void queryClient.invalidateQueries({ queryKey: profileQueryKey(session.userId) });
      router.replace("/onboarding?all=1");
    },
    onError: () => notify("Não foi possível sair do desafio. Tente de novo.", "danger"),
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

  if (!challenge || !session) {
    return null;
  }

  const isOwner = challenge.createdBy === session.userId;
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
            onSelect={(event) => {
              event.preventDefault();
              setLeaveOpen(true);
            }}
          >
            <DoorOpen className="size-4" aria-hidden />
            Sair do desafio
          </DropdownItem>
          {isOwner ? (
            <>
              <DropdownSeparator />
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
            </>
          ) : null}
        </DropdownContent>
      </Dropdown>

      <Modal
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Sair do desafio"
        description="Você sai do ranking e para de registrar metas a partir de agora. Seu histórico, seus pontos e seus streaks continuam no seu perfil — nada é apagado."
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            Para voltar depois, é só entrar de novo com o código do desafio.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setLeaveOpen(false)}>
              Continuar no desafio
            </Button>
            <Button variant="danger" loading={leaveMutation.isPending} onClick={() => leaveMutation.mutate()}>
              Sair do desafio
            </Button>
          </div>
        </div>
      </Modal>

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
