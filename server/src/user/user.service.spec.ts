import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserService } from './user.service';
import { CryptoService } from '../crypto/crypto.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { User, UserStatus } from '../entities/user.entity';

describe('UserService', () => {
  let service: UserService;
  let users: jest.Mocked<Repository<User>>;
  let redis: { set: jest.Mock; get: jest.Mock };
  let crypto: CryptoService;

  beforeEach(async () => {
    users = {
      findOneByOrFail: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<Repository<User>>;
    redis = { set: jest.fn().mockResolvedValue('OK'), get: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: REDIS_CLIENT, useValue: redis },
        CryptoService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => {
              const map: Record<string, unknown> = {
                'encrypt.key': 'a'.repeat(32),
              };
              return key in map ? map[key] : fallback;
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(UserService);
    crypto = moduleRef.get(CryptoService);
  });

  describe('getMe', () => {
    it('returns profile DTO (id, nickname, phone_mask, credits)', async () => {
      users.findOneByOrFail.mockResolvedValue({
        id: 'u-1',
        phoneEncrypted: crypto.encrypt('13800138000'),
        nickname: '用户8000',
        credits: 42,
        status: UserStatus.ACTIVE,
      } as User);
      const me = await service.getMe('u-1');
      expect(me).toEqual({
        id: 'u-1',
        nickname: '用户8000',
        phone_mask: '138****8000',
        credits: 42,
      });
    });
  });

  describe('updateMe', () => {
    it('persists nickname change and returns refreshed profile', async () => {
      users.update.mockResolvedValue({ affected: 1 } as never);
      users.findOneByOrFail.mockResolvedValue({
        id: 'u-1',
        phoneEncrypted: crypto.encrypt('13800138000'),
        nickname: '新昵称',
        credits: 0,
        status: UserStatus.ACTIVE,
      } as User);

      const me = await service.updateMe('u-1', { nickname: '新昵称' });
      expect(users.update).toHaveBeenCalledWith('u-1', { nickname: '新昵称' });
      expect(me.nickname).toBe('新昵称');
    });
  });

  describe('cancel', () => {
    it('soft-deletes: status=pending_delete, deleted_at=now, delete_at=+30d', async () => {
      const before = Date.now();
      const result = await service.cancel('u-1');
      const after = Date.now();

      expect(users.update).toHaveBeenCalledTimes(1);
      const [idArg, fields] = users.update.mock.calls[0] as [string, Record<string, unknown>];
      expect(idArg).toBe('u-1');
      expect(fields.status).toBe(UserStatus.PENDING_DELETE);
      const deletedAt = fields.deletedAt as Date;
      const deleteAt = fields.deleteAt as Date;
      expect(deletedAt).toBeInstanceOf(Date);
      expect(deleteAt).toBeInstanceOf(Date);
      // delete_at ≈ now + 30d
      const grace = deleteAt.getTime() - deletedAt.getTime();
      expect(grace).toBe(30 * 86400_000);
      // Sanity: deletedAt is between before and after.
      expect(deletedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(deletedAt.getTime()).toBeLessThanOrEqual(after);

      expect(result.ok).toBe(true);
      expect(result.delete_at).toBe(deleteAt);
    });

    it('writes a Redis revocation entry with 7d TTL', async () => {
      await service.cancel('u-1');
      expect(redis.set).toHaveBeenCalledWith(
        'user:cancelled:u-1',
        expect.any(String), // cancel timestamp
        'EX',
        7 * 86400,
      );
    });
  });
});
