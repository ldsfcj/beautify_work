import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from '../entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let repo: { create: jest.Mock; save: jest.Mock; createQueryBuilder: jest.Mock };
  let qb: {
    orderBy: jest.Mock;
    andWhere: jest.Mock;
    skip: jest.Mock;
    take: jest.Mock;
    getManyAndCount: jest.Mock;
  };

  beforeEach(async () => {
    qb = {
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    repo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  describe('write', () => {
    it('persists a row with the dotted action + target fields', async () => {
      await service.write({
        adminId: 'admin-1',
        action: 'user.credit.adjust',
        targetType: 'user',
        targetId: 'u-1',
        payload: { amount: 50, reason: 'manual bonus' },
      });
      expect(repo.create).toHaveBeenCalledWith({
        adminId: 'admin-1',
        action: 'user.credit.adjust',
        targetType: 'user',
        targetId: 'u-1',
        payload: { amount: 50, reason: 'manual bonus' },
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('swallows save errors so the calling action never fails', async () => {
      repo.save.mockRejectedValue(new Error('db down'));
      // No throw — the function is fire-and-forget.
      await expect(
        service.write({ adminId: 'a-1', action: 'preset.create' }),
      ).resolves.toBeUndefined();
    });

    it('defaults null targetType / targetId / payload', async () => {
      await service.write({ adminId: 'a-1', action: 'admin.login' });
      expect(repo.create).toHaveBeenCalledWith({
        adminId: 'a-1',
        action: 'admin.login',
        targetType: null,
        targetId: null,
        payload: null,
      });
    });
  });

  describe('list', () => {
    it('clamps pageSize to 1..200', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.list({ pageSize: 9999 });
      expect(qb.take).toHaveBeenCalledWith(200);
    });

    it('applies all filter knobs', async () => {
      qb.getManyAndCount.mockResolvedValue([[], 0]);
      await service.list({
        action: 'user.credit.adjust',
        adminId: 'a-1',
        targetId: 'u-1',
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
      });
      // 5 andWhere calls (action / adminId / targetId / fromDate / toDate)
      expect(qb.andWhere).toHaveBeenCalledTimes(5);
    });
  });
});
