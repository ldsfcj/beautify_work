import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import {
  ListNotificationOptions,
  NotificationService,
} from './notification.service';

/**
 * In-app notification endpoints, JWT-gated (the global JwtAuthGuard
 * is on, and the route is not @Public()). The frontend polls
 * `GET /list` every 5s when the bell is in view (D12) and calls
 * `PATCH /:id/read` when the user clicks a row.
 *
 * `POST /read-all` is a small convenience: hitting it from the
 * bell-icon "mark all as read" action avoids a fan-out of PATCH
 * calls.
 */
@Controller('notification')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get('list')
  async list(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const opts: ListNotificationOptions = {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      unreadOnly: unreadOnly === 'true' || unreadOnly === '1',
    };
    return this.service.list(user.id, opts);
  }

  @Patch(':id/read')
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.markRead(user.id, id);
  }

  @Post('read-all')
  async markAllRead(@CurrentUser() user: JwtPayload) {
    return this.service.markAllRead(user.id);
  }
}
