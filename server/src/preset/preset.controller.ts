import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { PresetService } from './preset.service';

/**
 * Public read-only endpoint that returns the curated procedure
 * catalogue grouped by category. Marked `@Public()` so the
 * dashboard can warm its Pinia cache before the user logs in
 * (the catalogue is identical for everyone; per-user pricing /
 * availability belongs in a later endpoint).
 */
@Controller('preset')
export class PresetController {
  constructor(private readonly service: PresetService) {}

  @Public()
  @Get('list')
  async list() {
    return this.service.list();
  }
}
