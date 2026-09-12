import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SpecialGoalsController } from './special-goals.controller';
import { SpecialGoalsService } from './special-goals.service';

@Module({
  imports: [AuthModule],
  controllers: [SpecialGoalsController],
  providers: [SpecialGoalsService],
})
export class SpecialGoalsModule {}
