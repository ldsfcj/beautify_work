import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminRefundsService, RefundsListQuery, RefundsListResult } from './admin-refunds.service';

interface RejectBody {
  reason: string;
}

/**
 *   GET  /api/admin/refunds                 paginated queue
 *   POST /api/admin/refunds/:id/approve     marks APPROVED, refunds credits
 *   POST /api/admin/refunds/:id/reject      marks REJECTED, requires reason
 */
@Controller('admin/refunds')
@UseGuards(AdminAuthGuard)
export class AdminRefundsController {
  constructor(private readonly svc: AdminRefundsService) {}

  @Get()
  list(@Query() query: RefundsListQuery): Promise<RefundsListResult> {
    return this.svc.list(query);
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() operator: JwtPayload) {
    return this.svc.approve(id, operator);
  }

  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: RejectBody,
    @CurrentUser() operator: JwtPayload,
  ) {
    return this.svc.reject(id, operator, body.reason);
  }
}
