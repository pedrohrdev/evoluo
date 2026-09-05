import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { ChallengesModule } from './challenges/challenges.module';
import { validateEnv } from './config/env.validation';
import { GoalsModule } from './goals/goals.module';
import { PointsModule } from './points/points.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RankingModule } from './ranking/ranking.module';
import { RecordsModule } from './records/records.module';
import { StreakModule } from './streak/streak.module';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    ProfilesModule,
    ChallengesModule,
    GoalsModule,
    RecordsModule,
    PointsModule,
    StreakModule,
    RankingModule,
  ],
})
export class AppModule {}
