import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly configService: ConfigService,
  ) {}

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

  // Dispara o e-mail de recuperação do Supabase Auth. NUNCA revela se o
  // e-mail existe: a resposta é a mesma em todos os casos (inclusive quando
  // o Supabase devolve erro), para não transformar esta rota num oráculo de
  // quais e-mails têm conta no Evoluo.
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const redirectTo = this.configService.get<string>('PASSWORD_RESET_REDIRECT_URL');

    await this.supabaseService.client.auth.resetPasswordForEmail(dto.email, {
      ...(redirectTo ? { redirectTo } : {}),
    });
  }

  // Segundo passo: o link do e-mail leva o usuário de volta ao app com um
  // token de recuperação; o frontend o reenvia aqui junto com a senha nova.
  // O token é validado contra o Supabase (getUser) — é ele que prova a
  // posse da conta — e só então a senha é trocada pelo adminClient.
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const { data, error } = await this.supabaseService.client.auth.getUser(dto.accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException('Link de recuperação inválido ou expirado. Peça um novo.');
    }

    const { error: updateError } = await this.supabaseService.adminClient.auth.admin.updateUserById(
      data.user.id,
      { password: dto.password },
    );

    if (updateError) {
      throw new BadRequestException(updateError.message);
    }
  }

  async signOut(accessToken: string): Promise<void> {
    const { error } = await this.supabaseService.adminClient.auth.admin.signOut(accessToken, 'global');

    if (error) {
      throw new BadRequestException(error.message);
    }
  }
}
