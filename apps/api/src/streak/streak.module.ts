import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StreakController } from './streak.controller';
import { StreakService } from './streak.service';

@Module({
  imports: [AuthModule],
  controllers: [StreakController],
  providers: [StreakService],
})
export class StreakModule {}
