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
import { AdminUsersService, AdminUserListQuery, AdminUserListResult } from './admin-users.service';

interface AdjustCreditsBody {
  amount: number;
  reason: string;
}

/**
 *   GET  /api/admin/users                paginated list (status / free-text)
 *   GET  /api/admin/users/:id            full detail
 *   POST /api/admin/users/:id/adjust-credits   manual balance bump
 *
 * Manual credits default to "any admin can bump" — a tighter policy
 * (e.g. super-only) can be added by adding a `@Roles('super')` and
 * piping RolesGuard in (the guard already exists, see Task 5).
 */
@Controller('admin/users')
@UseGuards(AdminAuthGuard)
export class AdminUsersController {
  constructor(private readonly svc: AdminUsersService) {}

  @Get()
  list(@Query() query: AdminUserListQuery): Promise<AdminUserListResult> {
    return this.svc.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }

  @Post(':id/adjust-credits')
  adjustCredits(
    @Param('id') id: string,
    @Body() body: AdjustCreditsBody,
    @CurrentUser() operator: JwtPayload,
  ) {
    return this.svc.adjustCredits(id, body, operator);
  }
}
