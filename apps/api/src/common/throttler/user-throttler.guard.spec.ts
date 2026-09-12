import { Request } from 'express';
import { UserThrottlerGuard } from './user-throttler.guard';

// getTracker é protected: o teste chama através de um subtipo, sem `any`.
class TestableGuard extends UserThrottlerGuard {
  public track(req: Request): Promise<string> {
    return this.getTracker(req);
  }
}

function jwtWithSub(sub: unknown): string {
  const payload = Buffer.from(JSON.stringify({ sub }), 'utf8').toString('base64url');
  return `header.${payload}.signature`;
}

function request(init: { authorization?: string; ip?: string; ips?: string[] }): Request {
  return {
    headers: init.authorization ? { authorization: init.authorization } : {},
    ip: init.ip,
    ips: init.ips ?? [],
  } as unknown as Request;
}

describe('UserThrottlerGuard', () => {
  const guard = Object.create(TestableGuard.prototype) as TestableGuard;

  it('buckets by user when a bearer token carries a sub claim', async () => {
    const tracker = await guard.track(request({ authorization: `Bearer ${jwtWithSub('user-1')}` }));

    expect(tracker).toBe('user:user-1');
  });

  // Este é o ponto de toda a classe: dois usuários diferentes atrás do MESMO
  // IP (o proxy do Next na Vercel, por onde passa 100% do tráfego) precisam
  // cair em baldes distintos. Com o tracker padrão do @nestjs/throttler eles
  // compartilhariam o limite, e o app inteiro viveria com 60 req/min no
  // total.
  it('separates two users arriving from the same proxy IP', async () => {
    const first = await guard.track(
      request({ authorization: `Bearer ${jwtWithSub('user-1')}`, ip: '10.0.0.1' }),
    );
    const second = await guard.track(
      request({ authorization: `Bearer ${jwtWithSub('user-2')}`, ip: '10.0.0.1' }),
    );

    expect(first).not.toBe(second);
  });

  it('falls back to the forwarded client IP on anonymous routes', async () => {
    const tracker = await guard.track(request({ ips: ['203.0.113.7'], ip: '10.0.0.1' }));

    expect(tracker).toBe('ip:203.0.113.7');
  });

  it('uses req.ip when there is no forwarded chain', async () => {
    const tracker = await guard.track(request({ ip: '198.51.100.4' }));

    expect(tracker).toBe('ip:198.51.100.4');
  });

  it.each([
    ['a non-bearer scheme', 'Basic abc'],
    ['a token that is not a JWT', 'Bearer not-a-jwt'],
    ['a JWT whose payload is not valid JSON', 'Bearer header.bm90LWpzb24.sig'],
  ])('falls back to the IP for %s', async (_label, authorization) => {
    const tracker = await guard.track(request({ authorization, ip: '198.51.100.4' }));

    expect(tracker).toBe('ip:198.51.100.4');
  });

  it('falls back to the IP when sub is present but not a string', async () => {
    const tracker = await guard.track(
      request({ authorization: `Bearer ${jwtWithSub(42)}`, ip: '198.51.100.4' }),
    );

    expect(tracker).toBe('ip:198.51.100.4');
  });

  it('never returns an empty tracker, even with no IP at all', async () => {
    const tracker = await guard.track(request({}));

    expect(tracker).toBe('ip:unknown');
  });
});
