"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth/auth-context";
import { QueryProvider } from "@/lib/query/query-provider";
import { SoundProvider } from "@/lib/sounds/sound-context";
import { ToastProvider } from "@/lib/toast/toast-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <SoundProvider>
          <TooltipProvider delayDuration={300}>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </SoundProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
