import { Skeleton } from "@/components/ui/feedback";
import { Surface } from "@/components/ui/surface";

// Mesmo formato da lista de desafios em app/onboarding/page.tsx (nome +
// "dia X de Y" + streak), com blocos animados no lugar dos dados reais.
export function ChallengeListSkeleton() {
  return (
    <ul className="flex flex-col gap-3" aria-hidden role="presentation">
      {Array.from({ length: 2 }).map((_, i) => (
        <li key={i}>
          <Surface className="flex items-center justify-between gap-4 p-4">
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="size-8 shrink-0 rounded-full" />
          </Surface>
        </li>
      ))}
    </ul>
  );
}
