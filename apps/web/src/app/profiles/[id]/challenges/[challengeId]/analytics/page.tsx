"use client";

import { BarChart3 } from "lucide-react";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { PageHeader } from "@/components/layout/page-header";
import { useProfileParticipation } from "@/lib/profile/profile-participation-context";

export default function ProfileChallengeAnalyticsPage() {
  const { participation } = useProfileParticipation();

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Análises"
        description="Valores reais registrados, mesmo quando a meta não foi concluída."
      />
      <AnalyticsView participantId={participation!.participantId} />
    </div>
  );
}
