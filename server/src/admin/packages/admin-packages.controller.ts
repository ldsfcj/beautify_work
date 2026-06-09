import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminPackagesService, AdminPackageUpsertDto } from './admin-packages.service';

/**
 *   GET    /api/admin/packages            ?includeInactive=true to see soft-disabled
 *   POST   /api/admin/packages            create
 *   PUT    /api/admin/packages/:id        update
 *   DELETE /api/admin/packages/:id        soft-disable
 */
@Controller('admin/packages')
@UseGuards(AdminAuthGuard)
export class AdminPackagesController {
  constructor(private readonly svc: AdminPackagesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.svc.list({ includeInactive: includeInactive === 'true' });
  }

  @Post()
  create(@Body() dto: AdminPackageUpsertDto, @CurrentUser() operator: JwtPayload) {
    return this.svc.upsert(dto, operator);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: AdminPackageUpsertDto,
    @CurrentUser() operator: JwtPayload,
  ) {
    return this.svc.upsert(dto, operator, id);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() operator: JwtPayload) {
    return this.svc.remove(id, operator);
  }
}
