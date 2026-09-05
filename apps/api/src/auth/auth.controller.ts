import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SignInDto } from './dto/sign-in.dto';
import { SignUpDto } from './dto/sign-up.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Limite mais restrito que o padrão global (etapa 19 "Segurança e regras
  // anti-exploit") — evita criação em massa de contas por um script.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  // Idem: mitiga tentativa de força bruta de senha contra uma conta.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Headers('authorization') authorization?: string): Promise<void> {
    const token = authorization?.split(' ')[1];

    if (!token) {
      throw new UnauthorizedException('Token de acesso ausente.');
    }

    await this.authService.signOut(token);
  }
}
