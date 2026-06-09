import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminPresetsService } from './admin-presets.service';
import { PresetItem } from '../../entities/preset-item.entity';
import { AuditService } from '../../audit/audit.service';

const operator = { id: 'admin-1', type: 'admin' } as any;

describe('AdminPresetsService', () => {
  let service: AdminPresetsService;
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
      save: jest.fn(async (entity) => ({ id: 'p-new', ...entity })),
    };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminPresetsService,
        { provide: getRepositoryToken(PresetItem), useValue: repo },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminPresetsService);
  });

  describe('list', () => {
    it('excludes inactive rows by default', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      await service.list();
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('includes inactive when requested', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);
      await service.list({ includeInactive: true });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('upsert (create)', () => {
    it('throws Conflict when the key is already in use', async () => {
      repo.findOne.mockResolvedValue({ id: 'p-1', key: 'foo' });
      await expect(
        service.upsert(
          {
            key: 'foo',
            category: 'nose',
            name: 'Foo',
            defaultPrompt: '...',
            creditsCost: 10,
          },
          operator,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates with default isActive=true and sortOrder=0', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = await service.upsert(
        {
          key: 'new-preset',
          category: 'nose',
          name: 'New',
          defaultPrompt: '...',
          creditsCost: 20,
        },
        operator,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true, sortOrder: 0 }),
      );
      expect(created.id).toBe('p-new');
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'preset.create' }),
      );
    });
  });

  describe('upsert (update)', () => {
    it('throws NotFound when the id is unknown', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.upsert(
          {
            key: 'x',
            category: 'nose',
            name: 'X',
            defaultPrompt: '...',
            creditsCost: 10,
          },
          operator,
          'missing',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('merges updates into the existing row', async () => {
      repo.findOne.mockResolvedValue({ id: 'p-1', key: 'foo', creditsCost: 10 });
      await service.upsert(
        {
          key: 'foo',
          category: 'nose',
          name: 'Foo updated',
          defaultPrompt: '...',
          creditsCost: 25,
        },
        operator,
        'p-1',
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p-1', name: 'Foo updated', creditsCost: 25 }),
      );
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'preset.update' }),
      );
    });
  });

  describe('remove', () => {
    it('soft-disables instead of deleting', async () => {
      repo.findOne.mockResolvedValue({ id: 'p-1', isActive: true });
      const res = await service.remove('p-1', operator);
      expect(res).toEqual({ id: 'p-1', isActive: false });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p-1', isActive: false }),
      );
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'preset.soft_delete' }),
      );
    });

    it('throws NotFound on missing id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove('missing', operator)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
