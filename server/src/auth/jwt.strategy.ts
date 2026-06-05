import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * Verifies HS256 JWTs signed with JWT_SECRET. On success the validated
 * payload (`{ sub, type, role?, iat, exp }`) is attached to `req.user`
 * via Passport — downstream code reads it through `@CurrentUser()` or
 * `RolesGuard` (Task 5).
 *
 * Token format: `Authorization: Bearer <jwt>`.
 * - `sub`     = user.id (UUID) or admin.id
 * - `type`    = 'user' | 'admin'  (used by AdminAuthGuard)
 * - `role`    = optional, present for admin tokens
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('jwt.secret');
    if (!secret) {
      throw new Error('JWT_SECRET is required for JwtStrategy');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  /**
   * Maps the verified payload to the shape downstream code expects on
   * `req.user`. The raw payload is already typed as `JwtPayload` in
   * common/decorators/current-user.decorator.ts.
   */
  validate(payload: { sub: string; type: 'user' | 'admin'; role?: 'admin' | 'super' }): {
    id: string;
    type: 'user' | 'admin';
    role?: 'admin' | 'super';
  } {
    return { id: payload.sub, type: payload.type, role: payload.role };
  }
}
