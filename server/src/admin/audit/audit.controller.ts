import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AuditService, AuditListQuery, AuditListResult } from '../../audit/audit.service';

/**
 * GET /api/admin/audit-logs — read-only list with filter knobs.
 * Writing happens as a side effect of other write endpoints (Task 34
 * wires the credit-adjust / preset / package / config / refund paths).
 */
@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard)
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  list(@Query() query: AuditListQuery): Promise<AuditListResult> {
    return this.svc.list(query);
  }
}
