import { Flame } from "lucide-react";
import { cn } from "@/lib/cn";

// Marca visual própria do streak: o número em destaque acompanhado de um
// ícone de chama discreto — nunca emoji, nunca uma pilha de badges. A cor
// muda de tom conforme o streak está vivo ou zerado, para o número já
// comunicar o estado sem precisar de texto adicional.
export function StreakFlame({
  value,
  size = "md",
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const alive = value > 0;
  const sizes = {
    sm: { icon: "size-3.5", text: "text-sm" },
    md: { icon: "size-4", text: "text-base" },
    lg: { icon: "size-6", text: "text-3xl" },
  }[size];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 font-display font-semibold tabular-nums", className)}
      title={`Streak atual: ${value} dia${value === 1 ? "" : "s"}`}
    >
      <Flame
        className={cn(sizes.icon, alive ? "text-accent" : "text-ink-faint")}
        fill={alive ? "currentColor" : "none"}
        aria-hidden
      />
      <span className={cn(sizes.text, alive ? "text-ink" : "text-ink-faint")}>{value}</span>
    </span>
  );
}
