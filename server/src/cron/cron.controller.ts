import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../common/guards/admin-auth.guard';
import { DailyReconcileCron } from './daily-reconcile.cron';

/**
 * Admin-facing manual trigger for cron jobs. Mostly useful during
 * incident response ("we just got a delayed notify batch from
 * wechat, run reconcile NOW") and for verification (Task 19 uses
 * this to prove the cron settles a stale order end-to-end).
 *
 * Scoped under `/api/admin/cron/...` so the AdminAuthGuard at the
 * app level (TODO Task 32 back-office auth wiring) only needs to
 * cover one path; future crons (expire-generations,
 * cleanup-orphan-files) drop in as siblings without re-touching
 * the auth setup.
 */
@Controller('admin/cron')
@UseGuards(AdminAuthGuard)
export class CronController {
  constructor(private readonly reconcile: DailyReconcileCron) {}

  @Post('run/dailyReconcile')
  @HttpCode(HttpStatus.OK)
  async runDailyReconcile(): Promise<{
    scanned: number;
    credited: number;
    warned: number;
  }> {
    return this.reconcile.reconcile();
  }
}
