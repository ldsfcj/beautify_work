import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditPackageController } from './credit-package.controller';
import { CreditPackageService } from './credit-package.service';
import { CreditPackage } from '../entities/credit-package.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CreditPackage])],
  controllers: [CreditPackageController],
  providers: [CreditPackageService],
  exports: [CreditPackageService],
})
export class CreditPackageModule {}
