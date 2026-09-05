"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-sm border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-faint",
          "transition-colors duration-150 ease-out",
          "hover:border-line-strong focus:border-accent",
          "disabled:opacity-40",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export const Field = ({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="text-sm font-medium text-ink-muted">
      {label}
    </label>
    {children}
    {error ? (
      <p className="text-xs text-danger" role="alert">
        {error}
      </p>
    ) : hint ? (
      <p className="text-xs text-ink-faint">{hint}</p>
    ) : null}
  </div>
);
