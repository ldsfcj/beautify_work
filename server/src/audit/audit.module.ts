import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { AuditService } from './audit.service';

/**
 * Standalone audit module. Exports `AuditService` (write-side) so
 * any module that performs a state-changing action can call
 * `audit.write(...)` — admin controllers, payment notify, reconcile
 * cron, etc. The read-side `AuditController` lives under `admin/`
 * since it is admin-gated; it imports this module to share the
 * service.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
