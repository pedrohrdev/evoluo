import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_ANON_KEY!: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_SERVICE_ROLE_KEY!: string;

  // Para onde o link do e-mail de recuperação de senha leva de volta (ex.:
  // https://evoluo.app/reset-password). Opcional: sem ela, o Supabase usa a
  // Site URL configurada no próprio projeto.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  PASSWORD_RESET_REDIRECT_URL?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Variáveis de ambiente inválidas ou ausentes:\n${errors.toString()}`);
  }

  return validated;
}
