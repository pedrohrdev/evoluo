import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// avatar_url não é editável por aqui — só via POST /profiles/me/avatar
// (upload de verdade, validado e gravado pelo ProfilesService.uploadAvatar).
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName?: string;
}
