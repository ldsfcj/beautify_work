import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AdminAiLogsService, AiLogsListQuery, AiLogsListResult } from './admin-ai-logs.service';

/**
 * GET /api/admin/ai-logs — paginated, filterable list of every AI
 * call. Used for cost / latency dashboards and incident response.
 */
@Controller('admin/ai-logs')
@UseGuards(AdminAuthGuard)
export class AdminAiLogsController {
  constructor(private readonly svc: AdminAiLogsService) {}

  @Get()
  list(@Query() query: AiLogsListQuery): Promise<AiLogsListResult> {
    return this.svc.list(query);
  }
}
