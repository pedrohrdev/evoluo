import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AnalyticsModule } from './analytics/analytics.module';
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
    // Limite padrão global (etapa 19 "Segurança e regras anti-exploit") —
    // rotas sensíveis (join por código, login, signup) definem um limite
    // mais restrito por cima deste via @Throttle() no próprio controller.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
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
    AnalyticsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
