import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminUsersService } from './admin-users.service';
import { User, UserStatus } from '../../entities/user.entity';
import { CreditLedgerService } from '../../credit/creditledger.service';

/**
 * AdminUsersService unit tests. We mock the User repo and the
 * CreditLedgerService; the focus is the list filters, the detail
 * NotFound, and that adjustCredits refuses non-positive amounts.
 */
describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let users: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
  };
  let qb: {
    orderBy: jest.Mock;
    andWhere: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };
  let credits: { recharge: jest.Mock };

  beforeEach(async () => {
    qb = {
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    users = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest.fn(),
    };
    credits = { recharge: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: CreditLedgerService, useValue: credits },
      ],
    }).compile();

    service = moduleRef.get(AdminUsersService);
  });

  describe('list', () => {
    it('clamps pagination and skips status filter when "all"', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.list({ page: -1, pageSize: 9999, status: 'all' });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(100);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('applies status + free-text filters and projects phoneMask from phoneHash', async () => {
      qb.getManyAndCount.mockResolvedValue([
        [
          {
            id: 'u-1',
            nickname: '小王',
            phoneHash: 'a1b2c3d4',
            credits: 100,
            status: UserStatus.ACTIVE,
          },
        ],
        1,
      ]);
      const res = await service.list({ status: UserStatus.ACTIVE, q: '小王', page: 1, pageSize: 20 });
      expect(qb.andWhere).toHaveBeenCalledTimes(2);
      expect(res.items[0].phoneMask).toBe('****c3d4');
    });
  });

  describe('detail', () => {
    it('throws NotFound when the user is missing', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(service.detail('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the user with a phoneMask on hit', async () => {
      users.findOne.mockResolvedValue({
        id: 'u-1',
        nickname: '小王',
        phoneHash: 'abcd',
        credits: 50,
        status: 'active',
      });
      const res = await service.detail('u-1');
      expect(res.phoneMask).toBe('****abcd');
    });
  });

  describe('adjustCredits', () => {
    it('rejects non-positive amounts (subtractions go through refunds)', async () => {
      await expect(
        service.adjustCredits(
          'u-1',
          { amount: 0, reason: 'test' },
          { id: 'admin-1', type: 'admin' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.adjustCredits(
          'u-1',
          { amount: -5, reason: 'test' },
          { id: 'admin-1', type: 'admin' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(credits.recharge).not.toHaveBeenCalled();
    });

    it('throws NotFound when the target user is missing', async () => {
      users.findOne.mockResolvedValue(null);
      await expect(
        service.adjustCredits(
          'missing',
          { amount: 10, reason: 'x' },
          { id: 'admin-1', type: 'admin' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('charges recharge with a relatedId that traces back to the operator + reason', async () => {
      users.findOne.mockResolvedValue({ id: 'u-1' });
      credits.recharge.mockResolvedValue({ balanceAfter: 110 });
      const res = await service.adjustCredits(
        'u-1',
        { amount: 10, reason: 'manual bonus' },
        { id: 'admin-1', type: 'admin' },
      );
      expect(credits.recharge).toHaveBeenCalledWith(
        'u-1',
        10,
        expect.stringMatching(/^admin-adjust:admin-1:\d+:manual bonus$/),
      );
      expect(res.balanceAfter).toBe(110);
    });
  });
});
