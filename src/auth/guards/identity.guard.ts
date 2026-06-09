import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserRole } from '@prisma/client';

/**
 * Optional 인증 가드
 * - JWT 있으면 → req.user 설정 (회원)
 * - JWT 없거나 무효 → req.guestId 설정 (헤더/body에서 추출)
 * - 둘 다 없어도 통과 (anonymous)
 *
 * 게스트 ID는 x-guest-id 헤더 또는 body.guestId에서 받음
 */
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<
      Request & {
        user?: { userId: string; role: UserRole };
        guestId?: string;
      }
    >();

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const token = auth.slice(7);
        const payload = await this.jwt.verifyAsync<{
          sub: string;
          role: UserRole;
        }>(token, {
          secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
        });
        req.user = { userId: payload.sub, role: payload.role };
        return true;
      } catch {
        // 무효 토큰 → 게스트로 fallback
      }
    }

    const headerGuestId = req.headers['x-guest-id'];
    const bodyGuestId = (req.body as { guestId?: string } | undefined)?.guestId;
    const guestId =
      (typeof headerGuestId === 'string' ? headerGuestId : undefined) ??
      bodyGuestId;

    if (guestId) {
      req.guestId = guestId;
    }

    return true;
  }
}
