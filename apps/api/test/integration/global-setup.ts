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
  const pg = new EmbeddedPostgres({
    databaseDir: '/tmp/evoluo-int-pg',
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
