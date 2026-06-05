import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

/**
 * SmsService unit tests. The Redis client, ConfigService, and PinoLogger
 * are all stubbed so the suite runs without docker / network.
 */
describe('SmsService', () => {
  let service: SmsService;
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
  };
  let config: { get: jest.Mock };
  let logger: { warn: jest.Mock; log: jest.Mock };

  beforeEach(async () => {
    redis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };
    config = { get: jest.fn().mockReturnValue('development') };
    logger = { warn: jest.fn(), log: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ConfigService, useValue: config },
        // @InjectPinoLogger(SmsService.name) resolves to token "PinoLogger:SmsService"
        { provide: 'PinoLogger:SmsService', useValue: logger },
      ],
    }).compile();

    service = moduleRef.get(SmsService);
  });

  describe('sendCode', () => {
    it('persists a 6-digit code with 60s TTL and returns the TTL', async () => {
      // First call → 1 (passes rate limit), 2nd → 2 (also passes, max=2)
      redis.incr.mockResolvedValueOnce(1);
      redis.incr.mockResolvedValueOnce(1); // for cooldown
      redis.expire.mockResolvedValue(1);

      const result = await service.sendCode('13800138000', '127.0.0.1');
      expect(result).toEqual({ ok: true, ttl: 60 });
      expect(redis.set).toHaveBeenCalledTimes(1);
      const [key, value, mode, ttl] = redis.set.mock.calls[0];
      expect(key).toBe('sms:13800138000');
      expect(value).toMatch(/^\d{6}$/);
      expect(mode).toBe('EX');
      expect(ttl).toBe(60);
    });

    it('logs the code in dev mode (no real aliyun call)', async () => {
      redis.incr.mockResolvedValue(1);
      redis.expire.mockResolvedValue(1);
      await service.sendCode('13800138000', '127.0.0.1');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '13800138000' }),
        expect.stringContaining('[dev] sms code'),
      );
    });

    it('throws 429 when the same phone hits the cooldown (2nd within 60s)', async () => {
      // First call (cooldown incr) returns 1 → no throw. Second call returns 2 → throw.
      redis.incr.mockResolvedValueOnce(1); // ip rate
      redis.incr.mockResolvedValueOnce(2); // phone cooldown → 2 > 1
      redis.expire.mockResolvedValue(1);

      await expect(service.sendCode('13800138000', '127.0.0.1')).rejects.toBeInstanceOf(
        HttpException,
      );
      // No code should have been written.
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('throws 429 when IP rate limit is exceeded', async () => {
      // First incr is for IP, returns 2 (already over cap of 1).
      redis.incr.mockResolvedValueOnce(2);
      await expect(service.sendCode('13800138000', '127.0.0.1')).rejects.toBeInstanceOf(
        HttpException,
      );
    });
  });

  describe('verifyCode', () => {
    it('returns true and deletes the key on match', async () => {
      redis.get.mockResolvedValue('123456');
      const ok = await service.verifyCode('13800138000', '123456');
      expect(ok).toBe(true);
      expect(redis.del).toHaveBeenCalledWith('sms:13800138000');
    });

    it('returns false on mismatch (does not delete the key)', async () => {
      redis.get.mockResolvedValue('123456');
      const ok = await service.verifyCode('13800138000', '000000');
      expect(ok).toBe(false);
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('returns false when no code is stored (expired or never sent)', async () => {
      redis.get.mockResolvedValue(null);
      const ok = await service.verifyCode('13800138000', '123456');
      expect(ok).toBe(false);
    });
  });
});
