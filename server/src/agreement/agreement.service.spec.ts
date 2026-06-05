import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityNotFoundError, Repository } from 'typeorm';
import { SystemConfig } from '../entities/system-config.entity';
import { UserAgreement } from '../entities/user-agreement.entity';
import { AgreementService } from './agreement.service';

/**
 * AgreementService unit tests. SystemConfig and UserAgreement repos are
 * stubbed so the suite runs without docker / network. The service
 * reads the current version from `system_configs.protocols.<type>` (Task
 * 12 design — version never comes from the request body) and writes
 * `(user_id, type, version)` to `user_agreements` idempotently via the
 * UNIQUE constraint.
 */
describe('AgreementService', () => {
  let service: AgreementService;
  let configs: { findOneByOrFail: jest.Mock };
  let agreements: { createQueryBuilder: jest.Mock };

  const mockConfigRow = (v: string, content: string) => ({
    key: 'protocols.user',
    value: { v, content },
    updatedBy: 'system',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });

  beforeEach(async () => {
    configs = { findOneByOrFail: jest.fn() };
    agreements = { createQueryBuilder: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AgreementService,
        { provide: getRepositoryToken(SystemConfig), useValue: configs },
        { provide: getRepositoryToken(UserAgreement), useValue: agreements },
      ],
    }).compile();

    service = moduleRef.get(AgreementService);
  });

  describe('getCurrent', () => {
    it('returns the current version + content for a known type', async () => {
      configs.findOneByOrFail.mockResolvedValue(mockConfigRow('v1.0', '协议内容...'));

      const result = await service.getCurrent('user');

      expect(result).toEqual({
        type: 'user',
        version: 'v1.0',
        content: '协议内容...',
      });
      expect(configs.findOneByOrFail).toHaveBeenCalledWith({ key: 'protocols.user' });
    });

    it('returns the privacy agreement when type=privacy', async () => {
      configs.findOneByOrFail.mockResolvedValue(mockConfigRow('v1.0', '隐私政策...'));

      const result = await service.getCurrent('privacy');

      expect(result.type).toBe('privacy');
      expect(configs.findOneByOrFail).toHaveBeenCalledWith({ key: 'protocols.privacy' });
    });

    it('throws NotFoundException when the protocol key is missing', async () => {
      // Defense-in-depth: an unknown type fails before hitting the repo
      // (avoids `key: undefined` → IS NULL SQL oddities). The repo is
      // never called.
      await expect(service.getCurrent('unknown' as 'user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(configs.findOneByOrFail).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the seeded row was deleted', async () => {
      // If a future migration drops the seeded key, the repo rejects
      // with EntityNotFoundError and the service maps that to 404.
      configs.findOneByOrFail.mockRejectedValue(
        new EntityNotFoundError(SystemConfig, { key: 'protocols.user' }),
      );

      await expect(service.getCurrent('user')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('accept', () => {
    /**
     * Build a fluent query-builder stub that resolves the supplied value
     * when `.execute()` is called. Mirrors TypeORM's
     *   repo.createQueryBuilder().insert().values(...).orIgnore().execute()
     * shape exactly so the test catches any drift in the service.
     */
    const stubInsert = () => {
      const exec = jest.fn().mockResolvedValue({ identifiers: [], raw: [] });
      const qb: Record<string, jest.Mock> = {
        insert: jest.fn(),
        values: jest.fn(),
        orIgnore: jest.fn(),
        execute: exec,
      };
      qb.insert.mockReturnValue(qb);
      qb.values.mockReturnValue(qb);
      qb.orIgnore.mockReturnValue(qb);
      agreements.createQueryBuilder.mockReturnValue(qb);
      return { qb, exec };
    };

    it('reads the current version from system_configs and inserts a user_agreements row', async () => {
      configs.findOneByOrFail.mockResolvedValue(mockConfigRow('v1.0', '协议...'));
      const { qb, exec } = stubInsert();

      const result = await service.accept('user-1', 'user');

      expect(result).toEqual({ ok: true, version: 'v1.0' });
      // Version comes from system_configs, never from the body.
      expect(configs.findOneByOrFail).toHaveBeenCalledWith({ key: 'protocols.user' });
      expect(qb.insert).toHaveBeenCalled();
      expect(qb.values).toHaveBeenCalledWith({
        userId: 'user-1',
        type: 'user',
        version: 'v1.0',
      });
      // The unique index handles idempotency — service explicitly opts in.
      expect(qb.orIgnore).toHaveBeenCalled();
      expect(exec).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: re-accepting the same (user, type, version) does not throw', async () => {
      configs.findOneByOrFail.mockResolvedValue(mockConfigRow('v1.0', '协议...'));
      // Simulate Postgres ON CONFLICT DO NOTHING — exec resolves successfully
      // even on a duplicate insert (no rows affected).
      stubInsert();

      await expect(service.accept('user-1', 'user')).resolves.toEqual({
        ok: true,
        version: 'v1.0',
      });
      // A second call must still resolve cleanly (the service's orIgnore()
      // call is what makes this safe, so we don't have to mock PG state).
      await expect(service.accept('user-1', 'user')).resolves.toEqual({
        ok: true,
        version: 'v1.0',
      });
    });

    it('propagates the underlying error when the protocol key is missing', async () => {
      configs.findOneByOrFail.mockRejectedValue(
        new EntityNotFoundError(SystemConfig, { key: 'protocols.user' }),
      );

      await expect(service.accept('user-1', 'user')).rejects.toThrow(NotFoundException);
      // No insert should have been issued.
      expect(agreements.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('does not insert when the type is unknown', async () => {
      await expect(service.accept('user-1', 'unknown' as 'user')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(agreements.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
