import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminAuthGuard } from './admin-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

function makeContext(isPublic: boolean): ExecutionContext {
  const handler = function noop() {};
  const cls = class Foo {};
  if (isPublic) {
    Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('AdminAuthGuard', () => {
  const reflector = new Reflector();
  const guard = new AdminAuthGuard(reflector);

  describe('canActivate', () => {
    it('bypasses super for @Public() routes', () => {
      expect(guard.canActivate(makeContext(true))).toBe(true);
    });
  });

  describe('handleRequest', () => {
    it('accepts a payload with type=admin', () => {
      const user = { sub: 'a1', type: 'admin' as const };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('accepts a payload with role=admin', () => {
      const user = { sub: 'a1', type: 'user' as const, role: 'admin' as const };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('accepts a payload with role=super', () => {
      const user = { sub: 'a1', type: 'user' as const, role: 'super' as const };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('rejects an unauthenticated request with ForbiddenException', () => {
      expect(() => guard.handleRequest(null, undefined)).toThrow(ForbiddenException);
    });

    it('rejects a regular user with ForbiddenException', () => {
      const user = { sub: 'u1', type: 'user' as const, role: 'user' as const };
      expect(() => guard.handleRequest(null, user)).toThrow(ForbiddenException);
    });
  });
});
