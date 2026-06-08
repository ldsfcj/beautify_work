import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

/**
 * In-app notification module. Exposed to:
 *   - the API surface (controller)
 *   - the worker that calls `NotificationService.create()` after
 *     a generation completes (Task 25)
 *   - the admin back-office notification page (Task 34) for
 *     system broadcasts
 */
@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
