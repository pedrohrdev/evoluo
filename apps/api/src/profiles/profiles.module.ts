import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoalsModule } from '../goals/goals.module';
import { RankingModule } from '../ranking/ranking.module';
import { RecordsModule } from '../records/records.module';
import { StreakModule } from '../streak/streak.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  // RecordsModule/StreakModule/RankingModule só para o bootstrap combinado
  // do próprio painel (getOwnDashboard) — evita 3 requisições HTTP a mais
  // no carregamento do app (etapa de performance, não muda nenhuma regra
  // de negócio: cada serviço continua sendo a única fonte da sua leitura).
  imports: [AuthModule, GoalsModule, RecordsModule, StreakModule, RankingModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
