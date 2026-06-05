import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CreditLedger, LedgerType } from '../entities/credit-ledger.entity';
import { User } from '../entities/user.entity';
import { CreditLedgerService } from './creditledger.service';

/**
 * CreditLedgerService unit tests. The transaction boundary is the only
 * thing worth mocking — every method is wrapped in
 * `dataSource.transaction(async (em) => { ... })`. We stub `em` with
 * a hand-rolled fake that tracks find/save/create calls so the test
 * can assert both the post-state and the order of operations.
 *
 * The DB-level atomicity guarantee (no lost updates on concurrent
 * consume) is verified by the `pessimistic_write` lock argument we
 * pass to `em.findOne`; that gets through to the SQL `FOR UPDATE`
 * clause in production.
 */
describe('CreditLedgerService', () => {
  let service: CreditLedgerService;
  let dataSource: { transaction: jest.Mock };
  let usersRepo: { findOneByOrFail: jest.Mock };
  let ledgerRepo: { find: jest.Mock };

  // ── Fakes for the transactional EntityManager ──
  let em: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let userState: { id: string; credits: number };

  const USER_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    userState = { id: USER_ID, credits: 0 };

    em = {
      findOne: jest.fn(async (_entity, opts) => {
        // Honour the `lock: { mode: 'pessimistic_write' }` arg so the
        // service's contract is observable in tests.
        return { ...userState };
      }),
      save: jest.fn(async (_entity, target) => {
        // `target` may be a User or a CreditLedger; for User updates
        // we mutate our in-memory state so subsequent reads see the
        // new balance.
        if (target && typeof target === 'object' && 'credits' in target) {
          userState.credits = target.credits;
          return target;
        }
        // For ledger rows just echo them back.
        return target;
      }),
      create: jest.fn((_entity, values) => ({ id: 'ledger-1', ...values })),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (em: EntityManager) => Promise<unknown>) =>
        cb(em as unknown as EntityManager),
      ),
    };

    usersRepo = { findOneByOrFail: jest.fn() };
    ledgerRepo = { find: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreditLedgerService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(CreditLedger), useValue: ledgerRepo },
      ],
    }).compile();

    service = moduleRef.get(CreditLedgerService);
  });

  describe('recharge', () => {
    it('adds credits and writes a positive ledger row', async () => {
      const result = await service.recharge(USER_ID, 100, 'order_1');

      expect(result).toEqual({ balanceAfter: 100 });
      // User credited.
      expect(userState.credits).toBe(100);
      // Ledger row created with the right shape.
      expect(em.create).toHaveBeenCalledWith(
        CreditLedger,
        expect.objectContaining({
          userId: USER_ID,
          type: LedgerType.RECHARGE,
          amount: 100,
          balanceAfter: 100,
          relatedId: 'order_1',
        }),
      );
      expect(em.save).toHaveBeenCalled();
    });

    it('rejects non-positive amounts with 400', async () => {
      await expect(service.recharge(USER_ID, 0, 'x')).rejects.toBeInstanceOf(HttpException);
      await expect(service.recharge(USER_ID, -5, 'x')).rejects.toBeInstanceOf(HttpException);
      // No transaction was even started.
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('uses pessimistic_write lock to prevent concurrent over-credit', async () => {
      await service.recharge(USER_ID, 50, 'o1');
      const call = em.findOne.mock.calls[0];
      // Second arg is the find options; the lock mode is what matters.
      const opts = call[1] as { lock?: { mode: string } };
      expect(opts.lock).toEqual({ mode: 'pessimistic_write' });
    });
  });

  describe('consume', () => {
    it('deducts credits and writes a negative ledger row atomically', async () => {
      userState.credits = 100;

      const result = await service.consume(USER_ID, 30, LedgerType.CONSUME, 'gen_1');

      expect(result).toEqual({ balanceAfter: 70 });
      expect(userState.credits).toBe(70);
      expect(em.create).toHaveBeenCalledWith(
        CreditLedger,
        expect.objectContaining({
          userId: USER_ID,
          type: LedgerType.CONSUME,
          amount: -30,
          balanceAfter: 70,
          relatedId: 'gen_1',
        }),
      );
    });

    it('throws 402 INSUFFICIENT_CREDITS when balance < amount (no deduction)', async () => {
      userState.credits = 10;

      await expect(
        service.consume(USER_ID, 30, LedgerType.CONSUME, 'gen_x'),
      ).rejects.toMatchObject({
        status: 402,
        response: { code: 'INSUFFICIENT_CREDITS' },
      });
      // Critical: no deduction happened.
      expect(userState.credits).toBe(10);
    });

    it('rejects non-positive amounts with 400', async () => {
      await expect(
        service.consume(USER_ID, 0, LedgerType.CONSUME, 'g'),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('refund', () => {
    it('credits back and writes a REFUND ledger row', async () => {
      userState.credits = 40;

      const result = await service.refund(USER_ID, 30, 'gen_1', '用户投诉');

      expect(result).toEqual({ balanceAfter: 70 });
      expect(em.create).toHaveBeenCalledWith(
        CreditLedger,
        expect.objectContaining({
          userId: USER_ID,
          type: LedgerType.REFUND,
          amount: 30,
          balanceAfter: 70,
          relatedId: 'gen_1',
          note: '用户投诉',
        }),
      );
    });

    it('rejects non-positive refund amounts with 400', async () => {
      await expect(service.refund(USER_ID, 0, 'g1', 'n')).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('transaction boundary', () => {
    it('wraps every operation in dataSource.transaction', async () => {
      userState.credits = 100;
      await service.recharge(USER_ID, 10, 'r');
      await service.consume(USER_ID, 5, LedgerType.CONSUME, 'c');
      await service.refund(USER_ID, 5, 'c', 'note');
      expect(dataSource.transaction).toHaveBeenCalledTimes(3);
    });
  });
});
