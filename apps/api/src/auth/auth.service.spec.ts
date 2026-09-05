import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let signUp: jest.Mock;
  let signInWithPassword: jest.Mock;
  let refreshSession: jest.Mock;
  let adminSignOut: jest.Mock;
  let supabaseService: SupabaseService;
  let service: AuthService;

  beforeEach(() => {
    signUp = jest.fn();
    signInWithPassword = jest.fn();
    refreshSession = jest.fn();
    adminSignOut = jest.fn();

    supabaseService = {
      client: {
        auth: { signUp, signInWithPassword, refreshSession },
      },
      adminClient: {
        auth: { admin: { signOut: adminSignOut } },
      },
    } as unknown as SupabaseService;

    service = new AuthService(supabaseService);
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
});
