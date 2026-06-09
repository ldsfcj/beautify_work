import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminConfigsService } from './admin-configs.service';

interface UpsertBody {
  value: unknown;
}

/**
 *   GET /api/admin/configs             list all
 *   PUT /api/admin/configs/:key        upsert (allowed-keys gate inside service)
 */
@Controller('admin/configs')
@UseGuards(AdminAuthGuard)
export class AdminConfigsController {
  constructor(private readonly svc: AdminConfigsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Put(':key')
  upsert(
    @Param('key') key: string,
    @Body() body: UpsertBody,
    @CurrentUser() operator: JwtPayload,
  ) {
    return this.svc.upsert(key, body.value, operator);
  }
}
