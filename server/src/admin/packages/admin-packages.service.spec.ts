import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminPackagesService } from './admin-packages.service';
import { CreditPackage } from '../../entities/credit-package.entity';
import { AuditService } from '../../audit/audit.service';

const operator = { id: 'admin-1', type: 'admin' } as any;

describe('AdminPackagesService', () => {
  let service: AdminPackagesService;
  let repo: {
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let audit: { write: jest.Mock };

  beforeEach(async () => {
    repo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'pkg-new', ...entity })),
    };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPackagesService,
        { provide: getRepositoryToken(CreditPackage), useValue: repo },
        { provide: AuditService, useValue: audit },
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
      const created = await service.upsert(
        {
          name: '新手',
          credits: 50,
          priceCents: 2900,
          validityDays: 90,
        },
        operator,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ bonusCredits: 0, isActive: true, sortOrder: 0 }),
      );
      expect(created.id).toBe('pkg-new');
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'package.create' }),
      );
    });
  });

  describe('upsert (update)', () => {
    it('throws NotFound on missing id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.upsert(
          { name: 'x', credits: 10, priceCents: 100, validityDays: 30 },
          operator,
          'missing',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('merges updates', async () => {
      repo.findOne.mockResolvedValue({ id: 'pkg-1', credits: 50, priceCents: 2900 });
      await service.upsert(
        { name: 'x', credits: 80, priceCents: 4900, validityDays: 90 },
        operator,
        'pkg-1',
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pkg-1', credits: 80, priceCents: 4900 }),
      );
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'package.update' }),
      );
    });
  });

  describe('remove', () => {
    it('soft-disables', async () => {
      repo.findOne.mockResolvedValue({ id: 'pkg-1', isActive: true });
      const res = await service.remove('pkg-1', operator);
      expect(res).toEqual({ id: 'pkg-1', isActive: false });
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'package.soft_delete' }),
      );
    });
  });
});
