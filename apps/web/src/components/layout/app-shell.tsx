"use client";

import Link from "next/link";
import { BottomNavBar, NavLinks } from "./nav-links";
import { UserMenu } from "./user-menu";

export function AppShell({
  challengeId,
  challengeName,
  headerExtra,
  children,
}: {
  challengeId: string;
  challengeName?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface-0/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link href={`/c/${challengeId}`} className="shrink-0 font-display text-lg font-bold tracking-tight text-ink">
              evol<span className="text-accent">u</span>o
            </Link>
            <NavLinks challengeId={challengeId} />
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {challengeName ? (
              <span className="hidden max-w-[180px] truncate text-sm text-ink-muted md:inline">{challengeName}</span>
            ) : null}
            {headerExtra}
            <UserMenu />
          </div>
        </div>
      </header>
      {/* pb extra em mobile: espaço para a BottomNavBar fixa não cobrir o
          final do conteúdo (item 17, "ajustes de layout para telas
          pequenas"). */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-24 sm:px-6 sm:pb-8">{children}</main>
      <BottomNavBar challengeId={challengeId} />
    </div>
  );
}
