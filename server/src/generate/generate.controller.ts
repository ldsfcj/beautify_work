import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { GenerateListQuery } from './dto/generate-list.dto';
import {
  DetailResult,
  DownloadUrlResult,
  GenerateService,
  ListResult,
  StatusResult,
  SubmitResult,
} from './generate.service';

export interface SubmitBodyDto {
  image_url: string;
  preset_keys: string[];
  text?: string;
}

/**
 * Generate endpoints. JWT-gated by the global JwtAuthGuard.
 * All read endpoints scope the result set to `user.id` so a
 * caller can never see another user's generation rows.
 *
 *   POST   /api/generate/submit              → 50ms hot path
 *   GET    /api/generate/status/:id          → poll-friendly status
 *   GET    /api/generate/list                → paginated history
 *   GET    /api/generate/:id                 → detail + AI logs
 *   DELETE /api/generate/:id                 → soft delete
 *   GET    /api/generate/:id/download-url    → signed OSS URL
 */
@Controller('generate')
export class GenerateController {
  constructor(private readonly service: GenerateService) {}

  @Post('submit')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async submit(
    @CurrentUser() user: JwtPayload,
    @Body() body: SubmitBodyDto,
  ): Promise<SubmitResult> {
    return this.service.submit(user.id, body);
  }

  @Get('status/:id')
  async status(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<StatusResult> {
    return this.service.status(user.id, id);
  }

  @Get('list')
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: GenerateListQuery,
  ): Promise<ListResult> {
    return this.service.list(user.id, {
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined,
      status: query.status as any,
    });
  }

  @Get(':id')
  async detail(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<DetailResult> {
    return this.service.detail(user.id, id);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ): Promise<{ id: string; status: 'deleted' }> {
    await this.service.softDelete(user.id, id);
    return { id, status: 'deleted' };
  }

  @Get(':id/download-url')
  async downloadUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<DownloadUrlResult> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '0.0.0.0';
    const ua = (req.headers['user-agent'] as string) ?? 'unknown';
    return this.service.downloadUrl(user.id, id, ip, ua);
  }
}
