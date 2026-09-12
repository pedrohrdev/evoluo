import { apiFetch } from "./client";

export interface PushConfig {
  /** false quando o servidor ainda não tem chaves VAPID configuradas. */
  enabled: boolean;
  publicKey: string | null;
  devices: number;
}

export function getPushConfig() {
  return apiFetch<PushConfig>("/push/config");
}

export function subscribePush(input: { endpoint: string; p256dh: string; auth: string }) {
  return apiFetch<{ id: string }>("/push/subscribe", { method: "POST", body: input });
}

export function unsubscribePush(endpoint: string) {
  return apiFetch<{ removed: number }>("/push/subscribe", { method: "DELETE", body: { endpoint } });
}
