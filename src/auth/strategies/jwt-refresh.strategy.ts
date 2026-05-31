import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';

export interface RefreshJwtPayload {
  sub: string;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshJwtPayload) {
    const body = req.body as { refreshToken?: string } | undefined;
    const refreshToken = body?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('refreshToken 누락');
    }
    return { userId: payload.sub, refreshToken };
  }
}
