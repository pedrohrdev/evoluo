import type { NextConfig } from "next";

// Todo /api/* do frontend é proxeado para o NestJS (porta padrão 3001,
// configurável via API_PROXY_ORIGIN). Isso evita configurar CORS no backend
// nesta etapa, que é estritamente de frontend (CLAUDE.md seção 4) — o
// browser só vê chamadas same-origin.
const API_PROXY_ORIGIN = process.env.API_PROXY_ORIGIN ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_ORIGIN}/:path*`,
      },
    ];
  },
};

export default nextConfig;
