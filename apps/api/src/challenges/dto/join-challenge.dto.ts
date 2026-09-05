import { IsString, Length } from 'class-validator';

export class JoinChallengeDto {
  // 8 caracteres (ver generate_join_code() em
  // supabase/migrations/20260905090300_challenges.sql). O código é
  // normalizado (trim + uppercase) no service antes da consulta, então o
  // formato aqui só precisa garantir o comprimento.
  @IsString()
  @Length(8, 8)
  joinCode!: string;
}
