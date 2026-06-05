import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgreementController } from './agreement.controller';
import { AgreementService } from './agreement.service';
import { SystemConfig } from '../entities/system-config.entity';
import { UserAgreement } from '../entities/user-agreement.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig, UserAgreement])],
  controllers: [AgreementController],
  providers: [AgreementService],
  exports: [AgreementService],
})
export class AgreementModule {}
