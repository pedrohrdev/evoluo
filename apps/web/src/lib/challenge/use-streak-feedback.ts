"use client";

import { useEffect } from "react";
import { useSound } from "@/lib/sounds/sound-context";
import { useToast } from "@/lib/toast/toast-context";

interface StreakSnapshot {
  currentStreak: number;
  longestStreak: number;
  dayCompletedToday: boolean;
}

function storageKey(participantId: string) {
  return `evoluo.streak-snapshot.${participantId}`;
}

function readSnapshot(participantId: string): StreakSnapshot | null {
  try {
    const raw = window.localStorage.getItem(storageKey(participantId));
    return raw ? (JSON.parse(raw) as StreakSnapshot) : null;
  } catch {
    return null;
  }
}

function writeSnapshot(participantId: string, snapshot: StreakSnapshot) {
  try {
    window.localStorage.setItem(storageKey(participantId), JSON.stringify(snapshot));
  } catch {
    /* ignorado */
  }
}

// Regra revisada (CLAUDE.md seção "Streak"): streak e "dia concluído" agora
// mudam em tempo real, a cada registro (inclusive podendo cair de novo se
// uma correção derrubar o dia de 3/3 para menos) — não só quando o job de
// fechamento roda. "Subiu"/"quebrou"/"dia concluído" continuam sendo
// percebidos comparando o valor atual com o último visto nesta
// sessão/dispositivo (guardado localmente), o que já cobre naturalmente
// tanto o crédito quanto a reversão. Cada evento dispara no máximo uma vez
// por transição observada.
export function useStreakFeedback(
  participantId: string | undefined,
  current: { currentStreak: number; longestStreak: number; dayCompletedToday: boolean } | undefined,
) {
  const { play } = useSound();
  const { notify } = useToast();

  useEffect(() => {
    if (!participantId || !current) return;

    const previous = readSnapshot(participantId);
    writeSnapshot(participantId, {
      currentStreak: current.currentStreak,
      longestStreak: current.longestStreak,
      dayCompletedToday: current.dayCompletedToday,
    });

    // Não dispara nada na primeira leitura (evita "comemorar" um valor que
    // já existia antes de abrir o app).
    if (!previous) return;

    if (current.dayCompletedToday && !previous.dayCompletedToday) {
      play("day-complete");
      notify("As 3 metas de hoje foram concluídas!", "success");
    }

    if (current.longestStreak > previous.longestStreak) {
      play("new-record");
      notify(`Novo recorde de streak: ${current.longestStreak} dias!`, "success");
    } else if (current.currentStreak > previous.currentStreak) {
      play("streak-up");
      notify(`Streak em ${current.currentStreak} dias.`, "success");
    } else if (current.currentStreak === 0 && previous.currentStreak > 0) {
      notify("O streak quebrou. Hoje é um novo começo.", "info");
    }
  }, [participantId, current, play, notify]);
}
