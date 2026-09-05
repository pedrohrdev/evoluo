import { Compass } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="font-display text-2xl font-bold tracking-tight text-ink">
        evol<span className="text-accent">u</span>o
      </p>
      <Compass className="size-8 text-ink-faint" aria-hidden />
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Página não encontrada</h1>
        <p className="mt-1 text-sm text-ink-muted">O link pode estar errado ou a página não existe mais.</p>
      </div>
      <Link
        href="/"
        className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-accent-on transition-colors hover:bg-accent-strong"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
