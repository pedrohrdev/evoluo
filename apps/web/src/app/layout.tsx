import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Evoluo",
  description: "Desafios entre amigos: metas, streak, pontos e ranking.",
  // Instalável na tela inicial (src/app/manifest.ts) — num produto de gesto
  // diário, o ícone na home é o lembrete mais barato que existe.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Evoluo" },
};

// A barra do navegador acompanha o grafite do app em vez de destoar.
export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="min-h-full font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
