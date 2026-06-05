import { HttpException } from '@nestjs/common';
import { checkIpRateLimit } from './rate-limiter';

const makeRedisStub = () => {
  const counts = new Map<string, number>();
  return {
    incr: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: jest.fn(async (key: string, _ttl: number) => {
      return counts.has(key) ? 1 : 0;
    }),
  };
};

describe('checkIpRateLimit', () => {
  let redis: ReturnType<typeof makeRedisStub>;

  beforeEach(() => {
    redis = makeRedisStub();
  });

  it('passes on the first request from a new IP and sets 60s TTL', async () => {
    await expect(checkIpRateLimit(redis as never, '1.2.3.4', 1)).resolves.toBeUndefined();
    expect(redis.incr).toHaveBeenCalledWith('sms:ip:1.2.3.4');
    expect(redis.expire).toHaveBeenCalledWith('sms:ip:1.2.3.4', 60);
  });

  it('throws 429 on the request that exceeds the per-minute cap', async () => {
    await checkIpRateLimit(redis as never, '1.2.3.4', 1);
    await expect(checkIpRateLimit(redis as never, '1.2.3.4', 1)).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('does not reset TTL on subsequent hits (no second EXPIRE)', async () => {
    await checkIpRateLimit(redis as never, '1.2.3.4', 5);
    await checkIpRateLimit(redis as never, '1.2.3.4', 5);
    await checkIpRateLimit(redis as never, '1.2.3.4', 5);
    expect(redis.expire).toHaveBeenCalledTimes(1);
  });

  it('counts each IP independently', async () => {
    await checkIpRateLimit(redis as never, '1.1.1.1', 1);
    await expect(
      checkIpRateLimit(redis as never, '1.1.1.1', 1),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      checkIpRateLimit(redis as never, '2.2.2.2', 1),
    ).resolves.toBeUndefined();
  });
});
