import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { SupabaseService } from '../../supabase/supabase.service';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

/**
 * Valida o Bearer token contra o Supabase Auth (auth.getUser) e anexa o
 * usuário autenticado ao request. Não verifica a assinatura do JWT
 * localmente — delega ao Supabase, evitando gerenciar chave/rotação de
 * JWT secret no backend.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly supabaseService: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente.');
    }

    const { data, error } = await this.supabaseService.client.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }

    request.user = { id: data.user.id, email: data.user.email ?? undefined };
    return true;
  }

  private extractToken(request: RequestWithUser): string | undefined {
    const header = request.headers.authorization;
    if (!header) {
      return undefined;
    }
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
