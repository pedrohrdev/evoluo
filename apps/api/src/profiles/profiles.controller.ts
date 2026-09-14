import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

// 5 MB — generoso para uma foto de perfil, pequeno o bastante para não virar
// vetor de abuso de armazenamento/banda. Mantenha em sincronia com o
// file_size_limit do bucket (supabase/migrations/<...>_avatars_storage.sql).
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

// Perfis são públicos para qualquer usuário autenticado (CLAUDE.md, seção 2
// "Perfis") — por isso GET :id não checa dono, só exige estar autenticado.
@UseGuards(SupabaseAuthGuard)
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me')
  findOwn(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.findById(user.id);
  }

  // Bootstrap combinado do painel próprio (ver ProfilesService.getOwnDashboard)
  // — só faz sentido pra "me": embutir o desafio padrão de outra pessoa não
  // tem consumidor no frontend (o perfil público de terceiros nunca mostra
  // hoje/streak/ranking ao vivo, só os agregados já presentes em GET :id).
  @Get('me/dashboard')
  findOwnDashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.profilesService.getOwnDashboard(user.id);
  }

  @Patch('me')
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateOwn(user.id, dto);
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_AVATAR_SIZE_BYTES } }),
  )
  uploadAvatar(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    return this.profilesService.uploadAvatar(user.id, file);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.profilesService.getPublicProfile(id);
  }
}
