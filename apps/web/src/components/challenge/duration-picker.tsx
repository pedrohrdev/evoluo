import { cn } from "@/lib/cn";

const DURATIONS = [30, 50, 100, 365] as const;

export function DurationPicker({
  value,
  onChange,
}: {
  value: (typeof DURATIONS)[number];
  onChange: (value: (typeof DURATIONS)[number]) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Duração do desafio">
      {DURATIONS.map((duration) => (
        <button
          key={duration}
          type="button"
          aria-pressed={value === duration}
          onClick={() => onChange(duration)}
          className={cn(
            "rounded-sm border px-2 py-2 text-center text-sm font-medium transition-colors duration-150",
            value === duration
              ? "border-accent bg-accent-soft text-accent-strong"
              : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {duration}d
        </button>
      ))}
    </div>
  );
}
