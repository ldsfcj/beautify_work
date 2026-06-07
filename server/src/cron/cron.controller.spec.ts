import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DailyReconcileCron } from './daily-reconcile.cron';
import { CronController } from './cron.controller';

/**
 * Unit tests for CronController. The controller is a thin pass-through
 * to `DailyReconcileCron.reconcile()`; what we own here is the auth
 * wiring (AdminAuthGuard must reject non-admin principals before the
 * handler runs) and the response shape (the cron already returns the
 * `{ scanned, credited, warned }` object the runbook verification step
 * expects to log).
 */
describe('CronController', () => {
  let controller: CronController;
  let reconcile: jest.Mocked<Pick<DailyReconcileCron, 'reconcile'>>;
  let guard: AdminAuthGuard;

  function ctxWithUser(user: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => () => undefined,
      getClass: () => CronController,
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reconcile = { reconcile: jest.fn() } as any;
    controller = new CronController(reconcile as unknown as DailyReconcileCron);
    guard = new AdminAuthGuard({ getAllAndOverride: () => false } as any);
  });

  it('delegates to DailyReconcileCron.reconcile and returns its result', async () => {
    const stats = { scanned: 4, credited: 2, warned: 2 };
    reconcile.reconcile.mockResolvedValue(stats);

    await expect(controller.runDailyReconcile()).resolves.toEqual(stats);
    expect(reconcile.reconcile).toHaveBeenCalledTimes(1);
  });

  it('AdminAuthGuard rejects an unauthenticated principal', () => {
    expect(() => guard.handleRequest(null, null)).toThrow(ForbiddenException);
  });

  it('AdminAuthGuard rejects a plain user principal', () => {
    expect(() =>
      guard.handleRequest(null, { type: 'user' } as any),
    ).toThrow(ForbiddenException);
  });

  it('AdminAuthGuard accepts type=admin', () => {
    const user = { type: 'admin' } as any;
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('AdminAuthGuard accepts role=admin', () => {
    const user = { type: 'user', role: 'admin' } as any;
    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('AdminAuthGuard accepts role=super', () => {
    const user = { type: 'user', role: 'super' } as any;
    expect(guard.handleRequest(null, user)).toBe(user);
  });
});
