import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { UnsubscribePushDto } from './dto/unsubscribe-push.dto';
import { PushService } from './push.service';

@UseGuards(SupabaseAuthGuard)
@Controller('push')
export class PushController {
  constructor(
    private readonly pushService: PushService,
    private readonly configService: ConfigService,
  ) {}

  // A chave pública VAPID é pública por definição — o navegador precisa dela
  // para criar a inscrição. `enabled` deixa o frontend esconder a opção
  // inteira quando o servidor ainda não tem chaves configuradas, em vez de
  // oferecer um botão que falharia.
  @Get('config')
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.pushService.countFor(user.id).then((devices) => ({
      enabled: this.pushService.isConfigured(),
      publicKey: this.configService.get<string>('VAPID_PUBLIC_KEY') ?? null,
      devices,
    }));
  }

  @Post('subscribe')
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribePushDto) {
    return this.pushService.subscribe(user.id, dto);
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.OK)
  unsubscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UnsubscribePushDto) {
    return this.pushService.unsubscribe(user.id, dto.endpoint);
  }
}
