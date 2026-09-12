import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnsubscribePushDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  endpoint!: string;
}
