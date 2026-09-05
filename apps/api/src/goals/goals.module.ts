import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [AuthModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  // Reutilizado pelo perfil público (etapa 10) para listar as metas de
  // cada participação sem duplicar a query de findAllForParticipant.
  exports: [GoalsService],
})
export class GoalsModule {}
