"use client";

import { History as HistoryIcon } from "lucide-react";
import { DailyHistoryView } from "@/components/history/daily-history-view";
import { PageHeader } from "@/components/layout/page-header";
import { useProfileParticipation } from "@/lib/profile/profile-participation-context";

export default function ProfileChallengeHistoryPage() {
  const { participation } = useProfileParticipation();

  return (
    <div>
      <PageHeader
        icon={HistoryIcon}
        title="Histórico diário"
        description="Dias já fechados — imutáveis, exatamente como registrados."
      />
      <DailyHistoryView participantId={participation!.participantId} />
    </div>
  );
}
