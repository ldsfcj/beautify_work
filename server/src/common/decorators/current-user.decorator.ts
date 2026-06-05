import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Shape attached to `req.user` after JwtStrategy.validate. The strategy
 * (Task 10) renames the JWT `sub` claim to `id` for ergonomics in
 * controllers, so `req.user.id` is the principal's UUID.
 *
 * `iat` / `exp` are preserved from the original token for revocation
 * checks (JwtAuthGuard compares `iat * 1000` against the cancel
 * timestamp stored in Redis).
 */
export interface JwtPayload {
  id: string;
  type: 'user' | 'admin';
  role?: 'admin' | 'super';
  iat?: number;
  exp?: number;
}

/**
 * Extract the authenticated principal from the request. Use in controllers
 * like `@CurrentUser() user: JwtPayload`.
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtPayload;
  },
);
