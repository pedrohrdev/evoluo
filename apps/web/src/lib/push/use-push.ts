"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getPushConfig, subscribePush, unsubscribePush } from "@/lib/api/push";

// A chave VAPID trafega em base64url; a API do navegador exige um
// BufferSource. O ArrayBuffer é alocado explicitamente porque o tipo
// `Uint8Array<ArrayBufferLike>` do TS moderno admite SharedArrayBuffer, que
// `applicationServerKey` não aceita.
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);

  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) {
    view[i] = raw.charCodeAt(i);
  }
  return buffer;
}

export type PushState =
  | "loading"
  /** Navegador sem suporte (iOS fora da tela inicial, por exemplo). */
  | "unsupported"
  /** Servidor ainda sem chaves VAPID. */
  | "disabled"
  | "denied"
  | "subscribed"
  | "unsubscribed";

/**
 * Ativa/desativa o lembrete de check-in neste dispositivo.
 *
 * A inscrição é por NAVEGADOR, não por conta: a mesma pessoa precisa ativar
 * no celular e no desktop separadamente, e é assim que deve ser — o lembrete
 * tem que chegar onde a pessoa está.
 */
export function usePush() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["push-config"],
    queryFn: getPushConfig,
    staleTime: 5 * 60_000,
  });

  const supported =
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

  // A fonte da verdade de "está inscrito?" é o NAVEGADOR, não o contador do
  // servidor: a pessoa pode ter revogado a permissão nas configurações do
  // sistema sem o backend ficar sabendo. Como é assíncrono, entra como
  // query — e não como efeito que chama setState, que é o que o lint
  // (react-hooks/set-state-in-effect) corretamente reclama.
  const { data: browserSubscribed } = useQuery({
    queryKey: ["push-browser-subscription"],
    queryFn: async () => {
      const registration = await navigator.serviceWorker.ready;
      return (await registration.pushManager.getSubscription()) !== null;
    },
    enabled: supported && config?.enabled === true,
    retry: false,
  });

  // Todo o resto é derivado — nenhum estado espelhado.
  const state: PushState = !config
    ? "loading"
    : !supported
      ? "unsupported"
      : !config.enabled || !config.publicKey
        ? "disabled"
        : Notification.permission === "denied"
          ? "denied"
          : browserSubscribed === undefined
            ? "loading"
            : browserSubscribed
              ? "subscribed"
              : "unsubscribed";

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["push-config"] });
    void queryClient.invalidateQueries({ queryKey: ["push-browser-subscription"] });
  }, [queryClient]);

  const enable = useCallback(async () => {
    if (!config?.publicKey) return;
    setPending(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        refresh();
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        // Exigido pelos navegadores: toda mensagem tem que ser visível ao
        // usuário. Push silencioso para rastrear alguém não é possível — e
        // nem é o que este lembrete faz.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(config.publicKey),
      });

      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("inscrição incompleta");
      }

      await subscribePush({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
    } catch {
      /* o estado real é relido do navegador logo abaixo */
    } finally {
      refresh();
      setPending(false);
    }
  }, [config, refresh]);

  const disable = useCallback(async () => {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Avisa o servidor ANTES de cancelar no navegador: se a ordem fosse
        // inversa e a chamada falhasse, a linha ficaria órfã no banco e o
        // servidor seguiria mandando push para um endereço morto.
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }

    } catch {
      /* o estado real é relido do navegador logo abaixo */
    } finally {
      refresh();
      setPending(false);
    }
  }, [refresh]);

  return { state, pending, devices: config?.devices ?? 0, enable, disable };
}
