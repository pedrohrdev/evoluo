"use client";

import { History as HistoryIcon } from "lucide-react";
import { DailyHistoryView } from "@/components/history/daily-history-view";
import { PageHeader } from "@/components/layout/page-header";
import { LoadingState } from "@/components/ui/feedback";
import { useChallenge } from "@/lib/challenge/challenge-context";

export default function HistoryPage() {
  const { participation } = useChallenge();
  const participantId = participation?.participantId;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon={HistoryIcon}
        title="Histórico diário"
        description="Dias já fechados — imutáveis, exatamente como registrados."
      />

      {participantId ? <DailyHistoryView participantId={participantId} /> : <LoadingState label="Carregando histórico…" />}
    </div>
  );
}
