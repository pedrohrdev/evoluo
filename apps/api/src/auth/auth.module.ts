import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthGuard],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
