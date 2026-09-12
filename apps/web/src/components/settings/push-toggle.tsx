"use client";

import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { usePush } from "@/lib/push/use-push";

// Ativa o lembrete de check-in neste dispositivo.
//
// Fica no painel do desafio, e não escondido nas configurações, porque é a
// única defesa contra o modo de falha mais caro do produto: esquecer um dia
// e perder o streak inteiro. Quem já ativou não vê nada — o card some.
export function PushToggle() {
  const { state, pending, enable } = usePush();

  // Some quando não há o que oferecer: já ativo, sem suporte no navegador,
  // ou servidor sem chaves configuradas.
  if (state === "loading" || state === "subscribed" || state === "unsupported" || state === "disabled") {
    return null;
  }

  if (state === "denied") {
    return (
      <Surface className="flex items-start gap-3 p-4">
        <BellOff className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
        <p className="text-sm text-ink-muted">
          As notificações estão bloqueadas para o Evoluo neste navegador. Para receber o lembrete, libere nas
          configurações do site.
        </p>
      </Surface>
    );
  }

  return (
    <Surface className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-sm font-medium text-ink">Receber o lembrete do check-in</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Um aviso antes da meia-noite nos dias em que você ainda não fechou as 3 metas.
          </p>
        </div>
      </div>
      <Button size="sm" loading={pending} onClick={() => void enable()} className="shrink-0">
        Ativar
      </Button>
    </Surface>
  );
}

// Versão com desligar, para o próprio perfil.
export function PushSettingRow() {
  const { state, pending, devices, enable, disable } = usePush();

  if (state === "loading" || state === "unsupported" || state === "disabled") return null;

  const on = state === "subscribed";
  const otherDevices = devices - 1;

  return (
    <Surface className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-ink">Lembrete do check-in</p>
        <p className="mt-0.5 text-sm text-ink-muted">
          {state === "denied"
            ? "Bloqueado nas configurações deste navegador."
            : on
              ? otherDevices > 0
                ? `Ativo neste e em mais ${otherDevices === 1 ? "1 dispositivo" : `${otherDevices} dispositivos`}.`
                : "Ativo neste dispositivo."
              : "Desativado neste dispositivo."}
        </p>
      </div>
      {state !== "denied" ? (
        <Button
          size="sm"
          variant={on ? "secondary" : "primary"}
          loading={pending}
          onClick={() => void (on ? disable() : enable())}
          className="shrink-0"
        >
          {on ? "Desativar" : "Ativar"}
        </Button>
      ) : null}
    </Surface>
  );
}
