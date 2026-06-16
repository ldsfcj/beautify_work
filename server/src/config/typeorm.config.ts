import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { User } from '../entities/user.entity';
import { CreditPackage } from '../entities/credit-package.entity';
import { Order } from '../entities/order.entity';
import { Generation } from '../entities/generation.entity';
import { PresetItem } from '../entities/preset-item.entity';
import { CreditLedger } from '../entities/credit-ledger.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { AiCallLog } from '../entities/ai-call-log.entity';
import { DownloadLog } from '../entities/download-log.entity';
import { Refund } from '../entities/refund.entity';
import { AdminUser } from '../entities/admin-user.entity';
import { UserAgreement } from '../entities/user-agreement.entity';
import { SmsCode } from '../entities/sms-code.entity';
import { Notification } from '../entities/notification.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { InitSchema1700000000000 } from '../migrations/1700000000000-InitSchema';
import { SeedPresetsAndConfigs1700000000001 } from '../migrations/1700000000001-SeedPresetsAndConfigs';
import { AddDeletedToGenerationStatus1700000000002 } from '../migrations/1700000000002-AddDeletedToGenerationStatus';
import { SeedAdminUser1700000000003 } from '../migrations/1700000000003-SeedAdminUser';
import { AuditLogs1700000000004 } from '../migrations/1700000000004-AuditLogs';
import { UpdateAiModelToWanx21Img2Img1700000000005 } from '../migrations/1700000000005-UpdateAiModelToWanx21Img2Img';
import { UpdateAiModelToWan27Image1700000000006 } from '../migrations/1700000000006-UpdateAiModelToWan27Image';

/**
 * Shared DataSource options consumed by:
 *   - the NestJS @nestjs/typeorm module (server bootstrap)
 *   - the typeorm-ts-node-commonjs CLI (migration:run / migration:revert)
 *
 * Migrations are append-only; new ones are added to the array below.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    User,
    CreditPackage,
    Order,
    Generation,
    PresetItem,
    CreditLedger,
    SystemConfig,
    AiCallLog,
    DownloadLog,
    Refund,
    AdminUser,
    UserAgreement,
    SmsCode,
    Notification,
    AuditLog,
  ],
  migrations: [
    InitSchema1700000000000,
    SeedPresetsAndConfigs1700000000001,
    AddDeletedToGenerationStatus1700000000002,
    SeedAdminUser1700000000003,
    AuditLogs1700000000004,
    UpdateAiModelToWanx21Img2Img1700000000005,
    UpdateAiModelToWan27Image1700000000006,
  ],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' ? ['error', 'warn', 'migration'] : ['error'],
};

/**
 * DataSource instance used by the typeorm CLI. The Nest runtime uses
 * `dataSourceOptions` directly via TypeOrmModule.forRootAsync.
 */
const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
