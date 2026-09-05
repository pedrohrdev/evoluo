import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GoalsModule } from '../goals/goals.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [AuthModule, GoalsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
