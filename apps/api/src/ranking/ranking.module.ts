import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';

@Module({
  imports: [AuthModule],
  controllers: [RankingController],
  providers: [RankingService],
  // Reutilizado por ProfilesService.getOwnDashboard para embutir o ranking
  // do desafio padrão no bootstrap do painel, sem round-trip separado.
  exports: [RankingService],
})
export class RankingModule {}
