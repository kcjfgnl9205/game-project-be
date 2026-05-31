import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export interface CurrentUserPayload {
  userId: string;
  role: UserRole;
  refreshToken?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
    const req = ctx.switchToHttp().getRequest<{ user: CurrentUserPayload }>();
    return req.user;
  },
);
