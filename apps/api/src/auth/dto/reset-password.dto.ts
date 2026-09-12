import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  // Token de recuperação que o Supabase Auth devolve no link do e-mail — o
  // frontend o lê do fragmento da URL e reenvia aqui. É ele que prova a
  // posse da conta; não existe outro caminho para trocar a senha sem saber
  // a atual.
  @IsString()
  accessToken!: string;

  // Mesmo mínimo do cadastro (SignUpDto) — trocar a senha nunca pode ser
  // uma porta para uma senha mais fraca do que o cadastro aceita.
  @IsString()
  @MinLength(8)
  password!: string;
}
