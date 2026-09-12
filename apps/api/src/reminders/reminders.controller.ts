import { Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { RemindersService } from './reminders.service';

/**
 * Disparo do lembrete diário.
 *
 * Não usa SupabaseAuthGuard porque quem chama não é um usuário: é um
 * agendador (pg_cron via `net.http_post`, o cron da Vercel, ou qualquer
 * outro). A autenticação é um segredo compartilhado em header — sem
 * `REMINDERS_CRON_SECRET` configurado a rota recusa tudo, em vez de ficar
 * aberta por omissão.
 */
@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly remindersService: RemindersService,
    private readonly configService: ConfigService,
  ) {}

  @Throttle({ default: { limit: 4, ttl: 60_000 } })
  @Post('daily')
  async runDaily(@Headers('x-cron-secret') secret?: string) {
    const expected = this.configService.get<string>('REMINDERS_CRON_SECRET');

    // Fechado por padrão: sem segredo configurado, ninguém dispara.
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Chamada não autorizada.');
    }

    const result = await this.remindersService.sendDailyReminders();
    return { date: this.remindersService.todayLabel(), ...result };
  }
}
