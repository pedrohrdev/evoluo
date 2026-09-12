import type { MetadataRoute } from "next";

// Torna o Evoluo instalável na tela inicial do celular.
//
// Um produto de gesto diário que só existe dentro do navegador depende de a
// pessoa lembrar de digitar o endereço. O ícone na home é o lembrete mais
// barato que existe — e é pré-requisito para Web Push mais adiante.
//
// `display: standalone` tira a barra do navegador; `start_url` cai em `/`,
// que já decide entre landing e painel conforme a sessão.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Evoluo — desafios entre amigos",
    short_name: "Evoluo",
    description: "Disciplina vira placar. Metas diárias, streak e ranking entre amigos.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    lang: "pt-BR",
    orientation: "portrait",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
