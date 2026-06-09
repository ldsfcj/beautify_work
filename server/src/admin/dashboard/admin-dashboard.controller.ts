import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AdminDashboardService, DashboardSummary } from './admin-dashboard.service';

/**
 * Back-office dashboard read endpoint. Single GET that hydrates the
 * landing-page cards (users, orders, AI, refunds). No pagination —
 * the data shape is fixed and small.
 *
 * Guard: AdminAuthGuard (any admin role can see dashboard metrics;
 * super-only reads aren't meaningful for the summary cards).
 */
@Controller('admin/dashboard')
@UseGuards(AdminAuthGuard)
export class AdminDashboardController {
  constructor(private readonly svc: AdminDashboardService) {}

  @Get()
  summary(): Promise<DashboardSummary> {
    return this.svc.summary();
  }
}
