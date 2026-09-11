import { cn } from "@/lib/cn";

// Sem next/image de propósito: avatarUrl vem do Supabase Storage (domínio
// externo), e configurar remotePatterns só por causa de uma foto pequena
// (bucket já limita a 5MB) não paga o custo. `className` controla o
// tamanho (ex.: "size-14") tanto na foto quanto no fallback de iniciais.
export function Avatar({
  displayName,
  avatarUrl,
  className,
  textClassName = "text-xl",
}: {
  displayName: string;
  avatarUrl?: string | null;
  className?: string;
  textClassName?: string;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={displayName} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-display font-semibold text-ink",
        textClassName,
        className,
      )}
    >
      {displayName.charAt(0).toUpperCase()}
    </span>
  );
}
