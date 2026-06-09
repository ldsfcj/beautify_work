import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminPackagesService } from './admin-packages.service';
import { CreditPackage } from '../../entities/credit-package.entity';

describe('AdminPackagesService', () => {
  let service: AdminPackagesService;
  let repo: {
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'pkg-new', ...entity })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPackagesService,
        { provide: getRepositoryToken(CreditPackage), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(AdminPackagesService);
  });

  describe('list', () => {
    it('excludes inactive by default', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      await service.list();
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('upsert (create)', () => {
    it('defaults bonusCredits=0, isActive=true, sortOrder=0', async () => {
      const created = await service.upsert({
        name: '新手',
        credits: 50,
        priceCents: 2900,
        validityDays: 90,
      });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bonusCredits: 0, isActive: true, sortOrder: 0 }),
      );
      expect(created.id).toBe('pkg-new');
    });
  });

  describe('upsert (update)', () => {
    it('throws NotFound on missing id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.upsert(
          { name: 'x', credits: 10, priceCents: 100, validityDays: 30 },
          'missing',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('merges updates', async () => {
      repo.findOne.mockResolvedValue({ id: 'pkg-1', credits: 50, priceCents: 2900 });
      await service.upsert(
        { name: 'x', credits: 80, priceCents: 4900, validityDays: 90 },
        'pkg-1',
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pkg-1', credits: 80, priceCents: 4900 }),
      );
    });
  });

  describe('remove', () => {
    it('soft-disables', async () => {
      repo.findOne.mockResolvedValue({ id: 'pkg-1', isActive: true });
      const res = await service.remove('pkg-1');
      expect(res).toEqual({ id: 'pkg-1', isActive: false });
    });
  });
});
