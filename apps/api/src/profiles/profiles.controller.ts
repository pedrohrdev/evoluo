import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfilesService } from './profiles.service';

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

  @Patch('me')
  updateOwn(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.profilesService.updateOwn(user.id, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.profilesService.findById(id);
  }
}
