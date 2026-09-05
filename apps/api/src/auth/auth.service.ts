import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@Injectable()
export class AuthService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async signUp(dto: SignUpDto) {
    const { data, error } = await this.supabaseService.client.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: dto.displayName ? { data: { display_name: dto.displayName } } : undefined,
    });

    if (error) {
      if (error.status === 422 || /already registered/i.test(error.message)) {
        throw new ConflictException('Já existe uma conta com este e-mail.');
      }
      throw new BadRequestException(error.message);
    }

    // Se a confirmação por e-mail estiver habilitada no projeto Supabase,
    // `session` vem null aqui — o cliente precisa logar depois de confirmar.
    return { user: data.user, session: data.session };
  }

  async signIn(dto: SignInDto) {
    const { data, error } = await this.supabaseService.client.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    return { user: data.user, session: data.session };
  }

  async refresh(dto: RefreshTokenDto) {
    const { data, error } = await this.supabaseService.client.auth.refreshSession({
      refresh_token: dto.refreshToken,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }

    return { user: data.user, session: data.session };
  }

  async signOut(accessToken: string): Promise<void> {
    const { error } = await this.supabaseService.adminClient.auth.admin.signOut(accessToken, 'global');

    if (error) {
      throw new BadRequestException(error.message);
    }
  }
}
