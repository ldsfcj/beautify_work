import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AdminOrdersService, AdminOrderListQuery, AdminOrderListResult } from './admin-orders.service';

/**
 * GET  /api/admin/orders          paginated, filterable list
 * GET  /api/admin/orders/:id      full detail (user + package joined)
 *
 * Both endpoints are admin-only; AdminAuthGuard enforces the principal
 * shape and the route is closed to customer JWTs.
 */
@Controller('admin/orders')
@UseGuards(AdminAuthGuard)
export class AdminOrdersController {
  constructor(private readonly svc: AdminOrdersService) {}

  @Get()
  list(@Query() query: AdminOrderListQuery): Promise<AdminOrderListResult> {
    return this.svc.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }
}
