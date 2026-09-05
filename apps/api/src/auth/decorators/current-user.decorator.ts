import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithUser } from '../guards/supabase-auth.guard';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    return request.user as AuthenticatedUser;
  },
);
