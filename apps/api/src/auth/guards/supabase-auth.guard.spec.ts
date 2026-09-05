import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

function createContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers, user: undefined };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('SupabaseAuthGuard', () => {
  let getUser: jest.Mock;
  let supabaseService: SupabaseService;
  let guard: SupabaseAuthGuard;

  beforeEach(() => {
    getUser = jest.fn();
    supabaseService = {
      client: { auth: { getUser } },
    } as unknown as SupabaseService;
    guard = new SupabaseAuthGuard(supabaseService);
  });

  it('rejects a request without an Authorization header', async () => {
    const context = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('rejects a header that is not a Bearer token', async () => {
    const context = createContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token that Supabase reports as invalid', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const context = createContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(getUser).toHaveBeenCalledWith('bad-token');
  });

  it('attaches the authenticated user to the request on a valid token', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'a@b.com' } },
      error: null,
    });
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: 'Bearer good-token' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toEqual({ id: 'user-1', email: 'a@b.com' });
  });
});
