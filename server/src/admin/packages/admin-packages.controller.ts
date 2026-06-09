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
  create(@Body() dto: AdminPackageUpsertDto) {
    return this.svc.upsert(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: AdminPackageUpsertDto) {
    return this.svc.upsert(dto, id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
