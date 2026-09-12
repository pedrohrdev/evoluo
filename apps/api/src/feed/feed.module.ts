import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';

@Module({
  imports: [PrismaModule, SupabaseModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
