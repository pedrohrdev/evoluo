"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        // Em telas estreitas, uma lista com muitos filtros vira uma faixa
        // rolável horizontalmente em vez de estourar a largura da página
        // (item 17) — mais natural no toque do que quebrar linha.
        "flex max-w-full items-center gap-1 overflow-x-auto rounded-md bg-surface-1 p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "shrink-0 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors duration-150",
        "hover:text-ink",
        "data-[state=active]:bg-surface-3 data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;
