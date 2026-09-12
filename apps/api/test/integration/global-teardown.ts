import type EmbeddedPostgres from 'embedded-postgres';

export default async function globalTeardown(): Promise<void> {
  const pg = (globalThis as { __EVOLUO_PG__?: EmbeddedPostgres }).__EVOLUO_PG__;
  await pg?.stop();
}
