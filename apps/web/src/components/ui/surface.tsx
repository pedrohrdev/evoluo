import { cn } from "@/lib/cn";

// Camada de elevação por cor de superfície, não por sombra (direção
// artística: hierarquia por camada). `level` 1 = painel padrão, 2 = mais
// elevado (dentro de outro painel, ex.: um item de lista destacado).
export function Surface({
  as: Tag = "div",
  level = 1,
  className,
  ...props
}: {
  as?: React.ElementType;
  level?: 1 | 2;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Tag
      className={cn(
        "rounded-md border border-line",
        level === 1 ? "bg-surface-1" : "bg-surface-2",
        className,
      )}
      {...props}
    />
  );
}
