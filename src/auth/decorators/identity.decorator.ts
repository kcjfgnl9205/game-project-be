import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

/**
 * 회원 또는 게스트를 통합 표현하는 타입
 * - type: 'user' → id는 User.id, role 포함
 * - type: 'guest' → id는 게스트 UUID (클라이언트 생성)
 */
export type Identity =
  | { type: 'user'; id: string; role: UserRole }
  | { type: 'guest'; id: string };

/**
 * 요청에서 회원 또는 게스트 식별 정보 추출
 *
 * 사전 조건: IdentityGuard가 먼저 실행되어 req.user 또는 req.guestId를 설정
 *
 * 사용 예:
 *   @UseGuards(IdentityGuard)
 *   @Post('rooms')
 *   create(@GetIdentity() identity: Identity) { ... }
 */
export const GetIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Identity | null => {
    const req = ctx.switchToHttp().getRequest<{
      user?: { userId: string; role: UserRole };
      guestId?: string;
    }>();

    if (req.user) {
      return { type: 'user', id: req.user.userId, role: req.user.role };
    }
    if (req.guestId) {
      return { type: 'guest', id: req.guestId };
    }
    return null;
  },
);
