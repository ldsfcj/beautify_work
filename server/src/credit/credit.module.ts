import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditLedgerService } from './creditledger.service';
import { CreditLedger } from '../entities/credit-ledger.entity';
import { User } from '../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CreditLedger, User])],
  providers: [CreditLedgerService],
  exports: [CreditLedgerService],
})
export class CreditModule {}
