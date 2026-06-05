import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * JWT payload shape attached to `req.user` by the (mock) JwtStrategy.
 * Production strategy (Task 10) populates `id` / `type` from the verified token.
 */
export interface JwtPayload {
  sub: string;
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
