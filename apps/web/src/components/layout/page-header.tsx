import type { LucideIcon } from "lucide-react";

// Cabeçalho padrão das telas secundárias (ranking, histórico, análises) —
// antes cada tela montava essa faixa ícone+título+subtítulo à mão, com
// pequenas divergências de espaçamento entre elas.
export function PageHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-2">
      <Icon className="size-5 text-accent" aria-hidden />
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
        <p className="text-sm text-ink-muted">{description}</p>
      </div>
    </div>
  );
}
