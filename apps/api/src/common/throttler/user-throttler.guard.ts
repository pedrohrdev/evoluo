import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Identifica quem está sendo limitado.
 *
 * O padrão do @nestjs/throttler é o IP do requisitante — o que não funciona
 * nesta topologia: o frontend (Vercel) proxeia todo `/api/*` para esta API
 * (apps/web/next.config.ts), então TODO usuário chega com o mesmo IP de
 * saída do proxy. Sem isto, os limites viram um balde único compartilhado
 * pelo app inteiro (60 req/min para todos juntos, 5 logins/min para todos
 * juntos), e dois ou três participantes usando ao mesmo tempo produzem 429.
 *
 * A chave passa a ser o `sub` (id do usuário) do JWT quando existe. O token
 * NÃO é validado aqui de propósito: validar é trabalho do SupabaseAuthGuard,
 * que roda depois; aqui o `sub` serve só para separar baldes. Um token
 * forjado no máximo escolhe o próprio balde — e continua sendo rejeitado
 * pelo guard de autenticação logo em seguida.
 *
 * Sem token (signup, login, refresh, forgot-password), cai no IP — que é o
 * comportamento correto para rotas anônimas, e onde `trust proxy`
 * (apps/api/src/main.ts) faz o Express ler o X-Forwarded-For real.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const subject = this.extractSubject(req);
    if (subject) {
      return `user:${subject}`;
    }

    const forwarded = req.ips?.length ? req.ips[0] : req.ip;
    return `ip:${forwarded ?? 'unknown'}`;
  }

  private extractSubject(req: Request): string | undefined {
    const header = req.headers?.authorization;
    if (!header) {
      return undefined;
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }

    const payload = token.split('.')[1];
    if (!payload) {
      return undefined;
    }

    try {
      const decoded = Buffer.from(payload, 'base64url').toString('utf8');
      const claims = JSON.parse(decoded) as { sub?: unknown };
      return typeof claims.sub === 'string' && claims.sub.length > 0 ? claims.sub : undefined;
    } catch {
      // Token malformado: não dá para separar por usuário, cai no IP.
      return undefined;
    }
  }
}
