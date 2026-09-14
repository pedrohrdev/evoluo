import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StreakController } from './streak.controller';
import { StreakService } from './streak.service';

@Module({
  imports: [AuthModule],
  controllers: [StreakController],
  providers: [StreakService],
  // Reutilizado por ProfilesService.getOwnDashboard para embutir o streak
  // do desafio padrão no bootstrap do painel, sem round-trip separado.
  exports: [StreakService],
})
export class StreakModule {}
