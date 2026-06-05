import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
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

describe('JwtAuthGuard', () => {
  const reflector = new Reflector();
  const guard = new JwtAuthGuard(reflector);

  describe('canActivate', () => {
    it('short-circuits to true when @Public() is set, without invoking super', () => {
      const ctx = makeContext(true);
      // If we were to fall through to super, passport would throw "Unknown auth strategy 'jwt'".
      // Returning true here proves the @Public bypass.
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  describe('handleRequest', () => {
    it('returns the user when authenticated', () => {
      const user = { sub: 'u1', type: 'user' as const };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('throws UnauthorizedException when no user is attached', () => {
      expect(() => guard.handleRequest(null, undefined)).toThrow(UnauthorizedException);
    });

    it('propagates the underlying error when passport itself errors', () => {
      const err = new Error('jwt malformed');
      expect(() => guard.handleRequest(err, undefined)).toThrow(UnauthorizedException);
      expect(() => guard.handleRequest(err, undefined)).toThrow('jwt malformed');
    });
  });
});
