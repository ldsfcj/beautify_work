/**
 * One-off integration check for CreditLedgerService. Boots Nest with
 * the real PG + Redis config, then drives recharge / consume /
 * refund against a freshly created test user. Verifies ledger rows
 * and user.credits after each step. Cleans up afterwards.
 *
 * Run with:  npx ts-node scripts/verify-credit.ts
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import configuration from '../src/config/configuration';
import { validateEnv } from '../src/config/validation';
import { dataSourceOptions } from '../src/config/typeorm.config';
import { CreditLedgerService } from '../src/credit/creditledger.service';
import { CreditLedger, LedgerType } from '../src/entities/credit-ledger.entity';
import { User, UserStatus } from '../src/entities/user.entity';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error('✗ FAIL:', msg);
    process.exit(1);
  }
  console.log('✓', msg);
}

async function main() {
  const mod = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnv }),
      TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: false }),
      TypeOrmModule.forFeature([CreditLedger, User]),
    ],
    providers: [CreditLedgerService],
  }).compile();

  const svc = mod.get(CreditLedgerService);
  const ds = mod.get(DataSource);
  const users = mod.get<Repository<User>>(getRepositoryToken(User));
  const ledger = mod.get<Repository<CreditLedger>>(getRepositoryToken(CreditLedger));

  // Make a fresh test user.
  const phone = `139${Date.now().toString().slice(-9)}`;
  const u = users.create({
    phoneHash: `verify-${Date.now()}`,
    phoneEncrypted: 'placeholder',
    nickname: 'verify-script',
    status: UserStatus.ACTIVE,
    credits: 0,
  });
  await users.save(u);
  console.log('test user:', u.id);

  try {
    // 1. recharge 100
    const r1 = await svc.recharge(u.id, 100, 'order_test_1');
    assert(r1.balanceAfter === 100, 'recharge(100) → balance 100');

    // 2. consume 30
    const c1 = await svc.consume(u.id, 30, LedgerType.CONSUME, 'gen_test_1');
    assert(c1.balanceAfter === 70, 'consume(30) → balance 70');

    // 3. consume 200 (insufficient → 402)
    let threw = false;
    try {
      await svc.consume(u.id, 200, LedgerType.CONSUME, 'gen_x');
    } catch (err: unknown) {
      const e = err as { getStatus?: () => number; getResponse?: () => unknown };
      threw = e.getStatus?.() === 402;
    }
    assert(threw, 'consume(200) on balance 70 → 402');

    // 4. DB verify: user.credits still 70
    const u2 = await users.findOneByOrFail({ id: u.id });
    assert(u2.credits === 70, 'user.credits still 70 after failed consume');

    // 5. refund 20
    const f1 = await svc.refund(u.id, 20, 'gen_test_1', 'verify');
    assert(f1.balanceAfter === 90, 'refund(20) → balance 90');

    // 6. ledger rows: should be 3 (recharge 100, consume -30, refund 20)
    const rows = await ledger.find({ where: { userId: u.id }, order: { createdAt: 'ASC' } });
    assert(rows.length === 3, `ledger has 3 rows (got ${rows.length})`);
    assert(rows[0].amount === 100 && rows[0].balanceAfter === 100, 'row[0] recharge 100 / balance 100');
    assert(rows[1].amount === -30 && rows[1].balanceAfter === 70, 'row[1] consume -30 / balance 70');
    assert(rows[2].amount === 20 && rows[2].balanceAfter === 90, 'row[2] refund 20 / balance 90');

    // 7. non-positive: 0 → 400
    let badReq = false;
    try {
      await svc.recharge(u.id, 0, 'x');
    } catch (err: unknown) {
      const e = err as { getStatus?: () => number };
      badReq = e.getStatus?.() === 400;
    }
    assert(badReq, 'recharge(0) → 400');

    // 8. non-integer: -5 → 400
    let badReq2 = false;
    try {
      await svc.recharge(u.id, -5, 'x');
    } catch (err: unknown) {
      const e = err as { getStatus?: () => number };
      badReq2 = e.getStatus?.() === 400;
    }
    assert(badReq2, 'recharge(-5) → 400');

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    // Cleanup
    await ledger.delete({ userId: u.id });
    await users.delete({ id: u.id });
    console.log('cleaned up test user + ledger');
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
