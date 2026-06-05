import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Default authentication guard. Skips routes marked with `@Public()`.
 * On success the verified JWT payload is attached to `req.user` as
 * a `JwtPayload` (see current-user.decorator.ts).
 *
 * NOTE: The real JwtStrategy lives in Task 10. For now the strategy is
 * registered in the test module; production behavior is the same shape.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
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
