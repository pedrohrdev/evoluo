import { cn } from "@/lib/cn";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-sm border px-2 py-2 text-center text-sm font-medium capitalize transition-colors duration-150",
            value === option.value
              ? "border-accent bg-accent-soft text-accent-strong"
              : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
