import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreditLedger, LedgerType } from '../entities/credit-ledger.entity';
import { User } from '../entities/user.entity';

/**
 * Append-only credit ledger. Every balance change goes through one of
 * `recharge` / `consume` / `refund`, all wrapped in a TypeORM
 * transaction with a `SELECT ... FOR UPDATE` row lock on the user
 * row. The combination gives us:
 *
 *   - **Atomicity**: user.credits update + ledger row insert happen
 *     in the same transaction; either both commit or neither.
 *   - **No lost updates**: `pessimistic_write` serialises concurrent
 *     consume calls on the same user, so two parallel `consume(50)`
 *     on a balance of 80 can never both succeed.
 *   - **Auditability**: every change is a signed ledger row with
 *     a denormalised `balanceAfter`, so the admin can replay the
 *     full history without re-summing.
 */
@Injectable()
export class CreditLedgerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(CreditLedger) private readonly ledger: Repository<CreditLedger>,
  ) {}

  /**
   * Add credits to a user. Called by the payment-callback handler in
   * Task 17 (`relatedId` = order_no). Always credits; the caller is
   * responsible for verifying the payment first.
   */
  async recharge(
    userId: string,
    amount: number,
    relatedId: string,
  ): Promise<{ balanceAfter: number }> {
    this.assertPositiveAmount(amount);
    return this.dataSource.transaction(async (em) => {
      const u = await this.lockUser(em, userId);
      u.credits += amount;
      await em.save(User, u);
      await em.save(
        em.create(CreditLedger, {
          userId,
          type: LedgerType.RECHARGE,
          amount,
          balanceAfter: u.credits,
          relatedId,
        }),
      );
      return { balanceAfter: u.credits };
    });
  }

  /**
   * Deduct credits. Throws 402 INSUFFICIENT_CREDITS when the balance
   * is below `amount`; the transaction rolls back so the user row
   * is untouched. `type` is passed through to the ledger so we can
   * distinguish AI-call consumption from refund-undo consumption
   * downstream (Task 25).
   */
  async consume(
    userId: string,
    amount: number,
    type: LedgerType,
    relatedId: string,
  ): Promise<{ balanceAfter: number }> {
    this.assertPositiveAmount(amount);
    return this.dataSource.transaction(async (em) => {
      const u = await this.lockUser(em, userId);
      if (u.credits < amount) {
        throw new HttpException(
          { code: 'INSUFFICIENT_CREDITS', message: '积分不足' },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      u.credits -= amount;
      await em.save(User, u);
      await em.save(
        em.create(CreditLedger, {
          userId,
          type,
          amount: -amount,
          balanceAfter: u.credits,
          relatedId,
        }),
      );
      return { balanceAfter: u.credits };
    });
  }

  /**
   * Refund previously consumed credits. Implemented as a positive
   * ledger entry with `type=refund` so admin reports can show
   * refund flow separately from new recharge (Task 32).
   */
  async refund(
    userId: string,
    amount: number,
    relatedId: string,
    note: string,
  ): Promise<{ balanceAfter: number }> {
    this.assertPositiveAmount(amount);
    return this.dataSource.transaction(async (em) => {
      const u = await this.lockUser(em, userId);
      u.credits += amount;
      await em.save(User, u);
      await em.save(
        em.create(CreditLedger, {
          userId,
          type: LedgerType.REFUND,
          amount,
          balanceAfter: u.credits,
          relatedId,
          note,
        }),
      );
      return { balanceAfter: u.credits };
    });
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async lockUser(em: DataSource['manager'] extends infer M ? M : never, userId: string) {
    const u = await em.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!u) {
      throw new BadRequestException(`用户 ${userId} 不存在`);
    }
    return u;
  }

  private assertPositiveAmount(amount: number): void {
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new BadRequestException('amount 必须为正整数');
    }
  }
}
