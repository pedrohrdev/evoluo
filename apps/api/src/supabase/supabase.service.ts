import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient, createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  /** Client com a anon key — usado para signup/login/refresh/validação de token. */
  public readonly client: SupabaseClient;

  /** Client com a service role key — usado apenas para operações admin (ex.: logout/revogação de sessão). */
  public readonly adminClient: SupabaseClient;

  constructor(configService: ConfigService) {
    const url = configService.getOrThrow<string>('SUPABASE_URL');
    const anonKey = configService.getOrThrow<string>('SUPABASE_ANON_KEY');
    const serviceRoleKey = configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');

    // O backend não mantém sessão própria: cada chamada recebe o token do
    // request atual, então não há necessidade de persistir/renovar sessão
    // dentro do client do supabase-js.
    const options = { auth: { persistSession: false, autoRefreshToken: false } };

    this.client = createClient(url, anonKey, options);
    this.adminClient = createClient(url, serviceRoleKey, options);
  }
}
