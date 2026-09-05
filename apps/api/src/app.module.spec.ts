import { Test } from '@nestjs/testing';

describe('AppModule wiring', () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:54322/postgres';
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resolves the full dependency graph without a live database connection', async () => {
    // Import depois de setar as env vars (o ConfigModule as lê no forRoot).
    // Só `.compile()`, sem `.init()`: não dispara onModuleInit do
    // PrismaService (que chamaria $connect contra um banco real).
    const { AppModule } = await import('./app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
  });
});
