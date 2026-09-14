import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RecordsController } from './records.controller';
import { RecordsService } from './records.service';

@Module({
  imports: [AuthModule],
  controllers: [RecordsController],
  providers: [RecordsService],
  // Reutilizado por ProfilesService.getOwnDashboard para embutir o estado
  // de "hoje" do desafio padrão no bootstrap do painel, sem round-trip
  // separado.
  exports: [RecordsService],
})
export class RecordsModule {}
