import { cn } from "@/lib/cn";

// Barra de progresso genérica (meta individual, dia, período). `tone`
// carrega significado: accent = em andamento/energia, success = concluída,
// danger = não concluída (só usada quando o período já fechou).
export function ProgressBar({
  value,
  tone = "accent",
  className,
}: {
  value: number; // 0-100, já deve vir clampado pelo chamador
  tone?: "accent" | "success" | "danger";
  className?: string;
}) {
  const toneClass = { accent: "bg-accent", success: "bg-success", danger: "bg-danger" }[tone];

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-300 ease-out", toneClass)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
