# evoluo

Ver `CLAUDE.md` para o contexto completo do produto, regras de negócio e fluxo de desenvolvimento por etapas.

## API (`apps/api`)

Backend NestJS. Integração com Supabase Auth (etapa 3) implementada em `apps/api/src/auth` e `apps/api/src/profiles`.

```bash
npm install
cp apps/api/.env.example apps/api/.env   # preencher com um projeto Supabase (local via `supabase start` ou remoto)
npm run api:build
npm run api:start:dev
npm run api:test
```

## Web (`apps/web`)

Frontend Next.js (App Router), identidade visual própria (etapa 15). Ver `apps/web/README.md`.

```bash
npm run web:dev
npm run web:build
npm run web:lint
npm run web:typecheck
```
