import { Inject, Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';
import { REDIS_CLIENT } from '../../redis/redis.constants';

/**
 * Default authentication guard. Skips routes marked with `@Public()`.
 * On success the verified JWT payload is attached to `req.user` as
 * a `JwtPayload` (see current-user.decorator.ts).
 *
 * Also enforces a per-user revocation list: when UserService.cancel
 * writes `user:cancelled:<id>` to Redis, any access/refresh token
 * issued *before* that timestamp is rejected (immediate revocation).
 *
 * Implementation note: `handleRequest` is kept sync to match
 * `IAuthGuard`'s signature; the revocation check runs in `canActivate`
 * after `super.canActivate()` has populated `req.user` (passport-jwt
 * resolves synchronously).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) {
      return false;
    }
    // After passport-jwt success, req.user is populated.
    const req = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = req.user;
    if (user && user.type === 'user' && user.id) {
      const cancelledAt = await this.redis.get(`user:cancelled:${user.id}`);
      if (cancelledAt) {
        const cancelTs = Number(cancelledAt);
        // token.iat is in seconds; cancelTs is in ms.
        if ((user.iat ?? 0) * 1000 < cancelTs) {
          throw new UnauthorizedException('账号已注销');
        }
      }
    }
    return true;
  }

  handleRequest<T = JwtPayload>(err: unknown, user: T): T {
    if (err || !user) {
      throw err instanceof Error
        ? new UnauthorizedException(err.message)
        : new UnauthorizedException('未登录或登录已过期');
    }
    return user;
  }
}
