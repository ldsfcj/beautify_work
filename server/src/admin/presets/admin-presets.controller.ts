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
import { AdminPresetsService, AdminPresetUpsertDto } from './admin-presets.service';

/**
 *   GET    /api/admin/presets            ?includeInactive=true to see soft-disabled
 *   POST   /api/admin/presets            create
 *   PUT    /api/admin/presets/:id        update
 *   DELETE /api/admin/presets/:id        soft-disable (sets isActive=false)
 */
@Controller('admin/presets')
@UseGuards(AdminAuthGuard)
export class AdminPresetsController {
  constructor(private readonly svc: AdminPresetsService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.svc.list({ includeInactive: includeInactive === 'true' });
  }

  @Post()
  create(@Body() dto: AdminPresetUpsertDto) {
    return this.svc.upsert(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: AdminPresetUpsertDto) {
    return this.svc.upsert(dto, id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
