import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

// Sobe um Postgres real e descartável para a suíte de integração.
//
// Sem isto, rodar estes testes exigiria Docker ou um Postgres instalado na
// máquina — e a consequência prática seria que ninguém os rodaria, que é
// exatamente como a lógica em SQL ficou sem cobertura por 22 etapas.
//
// Se DATABASE_URL_TEST já estiver definida (ex.: um serviço de CI com
// Postgres próprio), respeita e não sobe nada.
export default async function globalSetup(): Promise<void> {
  if (process.env.DATABASE_URL_TEST) {
    return;
  }

  const port = 55_432;
  const databaseDir = join(tmpdir(), 'evoluo-int-pg');

  // `initialise()` recusa um diretório não vazio, então uma execução
  // anterior deixaria a suíte quebrada da segunda vez em diante (e o CI,
  // que sempre parte de uma máquina limpa, esconderia isso). A base é
  // descartável por definição: apagar é o comportamento certo.
  rmSync(databaseDir, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('evoluo_test');
  } catch {
    // Já existe de uma execução anterior — resetSchema limpa tudo mesmo.
  }

  process.env.DATABASE_URL_TEST = `postgresql://postgres:postgres@localhost:${port}/evoluo_test`;
  (globalThis as { __EVOLUO_PG__?: EmbeddedPostgres }).__EVOLUO_PG__ = pg;
}
