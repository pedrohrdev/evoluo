import { Skeleton } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";

// Mesmo formato de app/c/[challengeId]/page.tsx (hero stats -> hoje -> feed
// -> metas de período + ranking), só que com blocos animados no lugar dos
// dados reais. Usado enquanto o painel carrega (ChallengeGate) ou, no caso
// raro de um desafio que não é o padrão, enquanto goals/today/streak ainda
// não chegaram — pedido do usuário: uma tela de carregando "de verdade",
// não só um spinner central, pra reduzir a sensação de espera.
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden role="presentation">
      <Surface className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </Surface>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="mb-4 h-2 w-full" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="mb-3 h-5 w-28" />
        <Skeleton className="h-24 w-full" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <Skeleton className="mb-3 h-5 w-36" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </section>
        <section className="lg:col-span-2">
          <Skeleton className="mb-3 h-5 w-24" />
          <Surface className="flex flex-col gap-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </Surface>
        </section>
      </div>
    </div>
  );
}
