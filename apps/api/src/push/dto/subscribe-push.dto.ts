import { IsString, MaxLength, MinLength } from 'class-validator';

export class SubscribePushDto {
  // A URL que o serviço de push do navegador devolve. Comprimento generoso
  // porque cada fornecedor (FCM, Mozilla, Apple) usa um formato diferente.
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  endpoint!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  p256dh!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  auth!: string;
}
