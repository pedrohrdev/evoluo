import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let signUp: jest.Mock;
  let signInWithPassword: jest.Mock;
  let refreshSession: jest.Mock;
  let adminSignOut: jest.Mock;
  let resetPasswordForEmail: jest.Mock;
  let getUser: jest.Mock;
  let updateUserById: jest.Mock;
  let supabaseService: SupabaseService;
  let configService: ConfigService;
  let service: AuthService;

  beforeEach(() => {
    signUp = jest.fn();
    signInWithPassword = jest.fn();
    refreshSession = jest.fn();
    adminSignOut = jest.fn();
    resetPasswordForEmail = jest.fn().mockResolvedValue({ data: {}, error: null });
    getUser = jest.fn();
    updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });

    supabaseService = {
      client: {
        auth: { signUp, signInWithPassword, refreshSession, resetPasswordForEmail, getUser },
      },
      adminClient: {
        auth: { admin: { signOut: adminSignOut, updateUserById } },
      },
    } as unknown as SupabaseService;

    configService = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
    service = new AuthService(supabaseService, configService);
  });

  describe('signUp', () => {
    it('forwards displayName as user metadata', async () => {
      signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });

      await service.signUp({ email: 'a@b.com', password: 'password123', displayName: 'Ana' });

      expect(signUp).toHaveBeenCalledWith({
        email: 'a@b.com',
        password: 'password123',
        options: { data: { display_name: 'Ana' } },
      });
    });

    it('throws ConflictException when the email is already registered', async () => {
      signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { status: 422, message: 'User already registered' },
      });

      await expect(
        service.signUp({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for other Supabase errors', async () => {
      signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { status: 400, message: 'Password too weak' },
      });

      await expect(
        service.signUp({ email: 'a@b.com', password: '123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('signIn', () => {
    it('returns user and session on success', async () => {
      const payload = { user: { id: 'u1' }, session: { access_token: 'tok' } };
      signInWithPassword.mockResolvedValue({ data: payload, error: null });

      const result = await service.signIn({ email: 'a@b.com', password: 'password123' });

      expect(result).toEqual(payload);
    });

    it('throws UnauthorizedException on invalid credentials', async () => {
      signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' },
      });

      await expect(
        service.signIn({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException when refresh fails', async () => {
      refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'expired' } });

      await expect(service.refresh({ refreshToken: 'bad' })).rejects.toThrow(UnauthorizedException);
    });

    it('returns the new session on success', async () => {
      const payload = { user: { id: 'u1' }, session: { access_token: 'new-tok' } };
      refreshSession.mockResolvedValue({ data: payload, error: null });

      const result = await service.refresh({ refreshToken: 'good' });

      expect(result).toEqual(payload);
    });
  });

  describe('signOut', () => {
    it('revokes the session via the admin client', async () => {
      adminSignOut.mockResolvedValue({ error: null });

      await service.signOut('access-token');

      expect(adminSignOut).toHaveBeenCalledWith('access-token', 'global');
    });

    it('throws BadRequestException when revocation fails', async () => {
      adminSignOut.mockResolvedValue({ error: { message: 'boom' } });

      await expect(service.signOut('access-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword', () => {
    it('passes the configured redirect URL to Supabase', async () => {
      (configService.get as jest.Mock).mockReturnValue('https://evoluo.app/reset-password');

      await service.forgotPassword({ email: 'a@b.com' });

      expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {
        redirectTo: 'https://evoluo.app/reset-password',
      });
    });

    it('omits redirectTo when the env var is not set, letting Supabase use its Site URL', async () => {
      (configService.get as jest.Mock).mockReturnValue(undefined);

      await service.forgotPassword({ email: 'a@b.com' });

      expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.com', {});
    });

    // Não pode virar um oráculo de "quais e-mails têm conta no Evoluo": a
    // resposta é a mesma exista ou não a conta, inclusive quando o Supabase
    // devolve erro.
    it('resolves silently when Supabase reports an error', async () => {
      resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: 'user not found' } });

      await expect(service.forgotPassword({ email: 'ninguem@b.com' })).resolves.toBeUndefined();
    });
  });

  describe('resetPassword', () => {
    it('updates the password after validating the recovery token', async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

      await service.resetPassword({ accessToken: 'recovery-token', password: 'novasenha123' });

      expect(getUser).toHaveBeenCalledWith('recovery-token');
      expect(updateUserById).toHaveBeenCalledWith('u1', { password: 'novasenha123' });
    });

    it('throws UnauthorizedException when the recovery token is invalid or expired', async () => {
      getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });

      await expect(
        service.resetPassword({ accessToken: 'expirado', password: 'novasenha123' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(updateUserById).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when Supabase refuses the new password', async () => {
      getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
      updateUserById.mockResolvedValue({ data: null, error: { message: 'senha fraca' } });

      await expect(
        service.resetPassword({ accessToken: 'recovery-token', password: 'novasenha123' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
