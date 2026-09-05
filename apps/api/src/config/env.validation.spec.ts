// class-transformer/class-validator dependem do polyfill de metadata do
// reflect-metadata. Em produção ele já está carregado como efeito
// colateral de main.ts importar @nestjs/common/core antes de qualquer
// módulo rodar (ambos fazem `require('reflect-metadata')` internamente) —
// aqui, testando validateEnv isoladamente, precisa ser importado à mão.
import 'reflect-metadata';
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const validConfig = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  };

  it('accepts a config with every required variable present', () => {
    expect(() => validateEnv(validConfig)).not.toThrow();
  });

  it('accepts PORT when omitted (optional)', () => {
    const result = validateEnv(validConfig);
    expect(result.PORT).toBeUndefined();
  });

  it('accepts a valid PORT and converts it to a number', () => {
    const result = validateEnv({ ...validConfig, PORT: '3001' });
    expect(result.PORT).toBe(3001);
  });

  it('throws when a required variable is missing — the app must refuse to boot misconfigured', () => {
    const { DATABASE_URL: _omit, ...withoutDatabaseUrl } = validConfig;
    expect(() => validateEnv(withoutDatabaseUrl)).toThrow(/Variáveis de ambiente inválidas/);
  });

  it('throws when PORT is out of the valid TCP port range', () => {
    expect(() => validateEnv({ ...validConfig, PORT: '70000' })).toThrow();
  });

  it('throws when PORT is not a number', () => {
    expect(() => validateEnv({ ...validConfig, PORT: 'not-a-port' })).toThrow();
  });
});
