# evoluo — web

Frontend Next.js (App Router). Ver `../../CLAUDE.md` para o contexto completo do produto e `../../docs/arquitetura-tecnica.md` para as decisões de arquitetura.

Todo `/api/*` é proxeado para o backend NestJS (`apps/api`, porta 3001 por padrão — configurável via `API_PROXY_ORIGIN`), configurado em `next.config.ts`. O frontend não usa o SDK do Supabase: autenticação é feita via `/api/auth/{signup,login,refresh,logout}`, já expostos pelo backend.

```bash
npm install
npm run api:start:dev   # em outro terminal — o backend precisa estar de pé
npm run web:dev
```

## Design system

Tokens de cor/tipografia/espaçamento em `src/app/globals.css` (Tailwind v4, `@theme inline`). Componentes de base em `src/components/ui`.

## Sons

Efeitos sonoros em `public/sounds/*.wav` são gerados localmente (tons sintetizados, sem nenhuma fonte externa) por `scripts/generate-sounds.ts`:

```bash
npm run generate:sounds -w apps/web
```
