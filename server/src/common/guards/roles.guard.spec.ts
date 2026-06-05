import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function makeContext(
  required: string[] | undefined,
  user: { type?: 'user' | 'admin'; role?: 'admin' | 'super' | 'user' } | undefined,
): ExecutionContext {
  const handler = function noop() {};
  const cls = class Foo {};
  if (required) {
    Reflect.defineMetadata(ROLES_KEY, required, handler);
  }
  const req = user ? { user } : {};
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('passes when no @Roles() is declared (auth handled by JwtAuthGuard)', () => {
    expect(guard.canActivate(makeContext(undefined, undefined))).toBe(true);
  });

  it('passes when user role matches one of the required roles', () => {
    expect(guard.canActivate(makeContext(['admin', 'super'], { role: 'admin' }))).toBe(true);
  });

  it('passes when payload type=admin and required contains "admin"', () => {
    expect(guard.canActivate(makeContext(['admin'], { type: 'admin' }))).toBe(true);
  });

  it('throws ForbiddenException when user role is not in the required list', () => {
    expect(() =>
      guard.canActivate(makeContext(['admin', 'super'], { role: 'user' })),
    ).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when there is no authenticated user', () => {
    expect(() => guard.canActivate(makeContext(['admin'], undefined))).toThrow(ForbiddenException);
  });
});
