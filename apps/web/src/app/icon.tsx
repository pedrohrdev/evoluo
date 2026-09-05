import { ImageResponse } from "next/og";

// Ícone gerado via next/og (App Router) — nada de arquivo binário externo:
// mesma marca usada no wordmark do app ("evoluo", com o "u" em destaque),
// reduzida a uma única letra sobre a superfície mais escura do design
// system, no acento âmbar.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          borderRadius: 7,
          fontFamily: "sans-serif",
          fontWeight: 700,
          fontSize: 22,
          color: "#f5a524",
        }}
      >
        e
      </div>
    ),
    size,
  );
}
