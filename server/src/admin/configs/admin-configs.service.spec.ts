import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminConfigsService } from './admin-configs.service';
import { SystemConfig } from '../../entities/system-config.entity';
import { AuditService } from '../../audit/audit.service';

describe('AdminConfigsService', () => {
  let service: AdminConfigsService;
  let repo: { findAndCount: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let audit: { write: jest.Mock };

  beforeEach(async () => {
    repo = {
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (e) => e),
    };
    audit = { write: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminConfigsService,
        { provide: getRepositoryToken(SystemConfig), useValue: repo },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AdminConfigsService);
  });

  describe('upsert', () => {
    it('rejects keys outside the allowlist', async () => {
      await expect(
        service.upsert(
          'not_allowed',
          { x: 1 },
          { id: 'a-1', type: 'admin' },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates an existing key and writes an audit row', async () => {
      repo.findOne.mockResolvedValue({
        key: 'rate_limit',
        value: { perMinute: 10 },
        updatedBy: 'system',
      });
      await service.upsert(
        'rate_limit',
        { perMinute: 20 },
        { id: 'a-1', type: 'admin' },
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'rate_limit', value: { perMinute: 20 }, updatedBy: 'a-1' }),
      );
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'a-1',
          action: 'config.update',
          targetId: 'rate_limit',
        }),
      );
    });

    it('creates a new key with a config.create audit row', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.upsert(
        'refund_policy',
        { maxHours: 72 },
        { id: 'a-1', type: 'admin' },
      );
      expect(repo.create).toHaveBeenCalledWith({
        key: 'refund_policy',
        value: { maxHours: 72 },
        updatedBy: 'a-1',
      });
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'config.create' }),
      );
    });
  });
});
