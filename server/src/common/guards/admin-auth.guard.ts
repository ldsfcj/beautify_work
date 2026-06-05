import { Injectable, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Guard for back-office (admin) routes. Behaviour:
 *   - `@Public()` route → bypass
 *   - No authenticated principal → 403
 *   - Principal.type === 'admin' or .role in {'admin','super'} → allow
 *   - Anything else → 403
 */
@Injectable()
export class AdminAuthGuard extends AuthGuard('jwt') {
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
      throw new ForbiddenException('需要管理员登录');
    }
    const payload = user as unknown as JwtPayload;
    const isAdmin = payload.type === 'admin' || payload.role === 'admin' || payload.role === 'super';
    if (!isAdmin) {
      throw new ForbiddenException('需要管理员权限');
    }
    return user;
  }
}
