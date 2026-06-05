import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Role } from '../decorators/roles.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * RBAC guard. Pair with `@Roles('admin', 'super')` on controller methods.
 * If no `@Roles()` is declared, the guard is a no-op (authentication is
 * enforced separately by JwtAuthGuard).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    const userRole: Role | undefined = user?.role ?? (user?.type === 'admin' ? 'admin' : 'user');

    if (!userRole || !required.includes(userRole)) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}
