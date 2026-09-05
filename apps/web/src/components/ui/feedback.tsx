import { AlertTriangle, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-line px-6 py-10 text-center">
      {Icon ? <Icon className="size-6 text-ink-faint" aria-hidden /> : null}
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-ink-faint", className)} aria-hidden />;
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted" role="status">
      <Spinner />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-line bg-danger-soft px-6 py-8 text-center" role="alert">
      <AlertTriangle className="size-5 text-danger" aria-hidden />
      <p className="text-sm text-ink">{message}</p>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-sm bg-surface-3", className)} />;
}
