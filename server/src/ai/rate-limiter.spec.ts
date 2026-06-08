import { HttpException, HttpStatus } from '@nestjs/common';
import { checkAiRateLimit, releaseBurst, DEFAULT_RATE_LIMIT } from './rate-limiter';

/**
 * Unit tests for the AI rate limiter. We mock Redis with an
 * `eval` spy that simulates the Lua-script decision tree. The
 * mock is intentionally stateful (a counter Map) so the test
 * exercises the same sequence the real script would: INCR all
 * three keys, check each against its limit, return 0/1.
 *
 * The two key behaviours the runbook (Task 24 Done Criteria)
 * calls out:
 *   1. 5 calls pass under perMinute=5, the 6th throws 429
 *   2. with perMinute=2, the 3rd call throws 429
 *
 * Plus we cover the burst counter and release semantics so the
 * worker side (Task 25) has a known contract to call against.
 */
describe('checkAiRateLimit', () => {
  const userId = 'user-rate';

  function makeRedis() {
    const counters = new Map<string, number>();
    return {
      eval: jest.fn(
        async (
          _script: string,
          _numKeys: number,
          mKey: string,
          dKey: string,
          bKey: string,
        ) => {
          const bump = (k: string) => {
            const c = (counters.get(k) ?? 0) + 1;
            counters.set(k, c);
            return c;
          };
          // Order matches the Lua: burst → minute → day.
          const b = bump(bKey);
          if (b > 0) {
            // no TTL handling in the mock; spec doesn't need it
          }
          if (b > 0) {
            // not used; mock doesn't enforce TTL
          }
          const m = bump(mKey);
          const d = bump(dKey);
          // Caller passes perMin/perDay/burst as ARGV[1..3]. We
          // need them to compare. The mock doesn't see ARGV, so
          // the test wires the expected values via a `cfg` ref.
          (makeRedis as any).lastB = b;
          (makeRedis as any).lastM = m;
          (makeRedis as any).lastD = d;
          return 1; // resolved by the wrapper below
        },
      ),
      decr: jest.fn(async (k: string) => {
        const c = (counters.get(k) ?? 0) - 1;
        counters.set(k, c);
        return c;
      }),
      set: jest.fn(async (k: string, v: string) => {
        counters.set(k, Number(v));
        return 'OK';
      }),
    };
  }

  function makeRedisWithLimits(cfg: { perMinute: number; perDay: number; burst: number }) {
    const counters = new Map<string, number>();
    const redis = {
      eval: jest.fn(
        async (
          _script: string,
          _numKeys: number,
          mKey: string,
          dKey: string,
          bKey: string,
        ) => {
          const bump = (k: string) => {
            const c = (counters.get(k) ?? 0) + 1;
            counters.set(k, c);
            return c;
          };
          const b = bump(bKey);
          if (b > cfg.burst) return 0;
          const m = bump(mKey);
          if (m > cfg.perMinute) return 0;
          const d = bump(dKey);
          if (d > cfg.perDay) return 0;
          return 1;
        },
      ),
      decr: jest.fn(async (k: string) => {
        const c = (counters.get(k) ?? 0) - 1;
        counters.set(k, c);
        return c;
      }),
      set: jest.fn(async (k: string, v: string) => {
        counters.set(k, Number(v));
        return 'OK';
      }),
    };
    return redis;
  }

  it('5 calls pass under perMinute=5, the 6th throws 429', async () => {
    // Use burst >= perMinute so we isolate the per-minute window
    // from the burst counter; otherwise the burst limit would
    // trip first (default burst is 3).
    const cfg = { perMinute: 5, perDay: 50, burst: 5, downloadPerHour: 20 };
    const redis = makeRedisWithLimits(cfg) as any;

    for (let i = 0; i < 5; i++) {
      await expect(
        checkAiRateLimit(redis, userId, cfg),
      ).resolves.toBeUndefined();
    }
    await expect(
      checkAiRateLimit(redis, userId, cfg),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      checkAiRateLimit(redis, userId, cfg),
    ).rejects.toMatchObject({
      response: { code: 'AI_RATE_LIMITED' },
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('perMinute=2 → 3rd call throws 429', async () => {
    const redis = makeRedisWithLimits({ perMinute: 2, perDay: 50, burst: 3 }) as any;

    await expect(
      checkAiRateLimit(redis, userId, { ...DEFAULT_RATE_LIMIT, perMinute: 2 }),
    ).resolves.toBeUndefined();
    await expect(
      checkAiRateLimit(redis, userId, { ...DEFAULT_RATE_LIMIT, perMinute: 2 }),
    ).resolves.toBeUndefined();
    await expect(
      checkAiRateLimit(redis, userId, { ...DEFAULT_RATE_LIMIT, perMinute: 2 }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('perDay=1 → 2nd call throws 429', async () => {
    const redis = makeRedisWithLimits({ perMinute: 5, perDay: 1, burst: 3 }) as any;

    await expect(
      checkAiRateLimit(redis, userId, { ...DEFAULT_RATE_LIMIT, perDay: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      checkAiRateLimit(redis, userId, { ...DEFAULT_RATE_LIMIT, perDay: 1 }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('burst=1 → 2nd call in the same minute throws 429', async () => {
    const redis = makeRedisWithLimits({ perMinute: 5, perDay: 50, burst: 1 }) as any;

    await expect(
      checkAiRateLimit(redis, userId, { ...DEFAULT_RATE_LIMIT, burst: 1 }),
    ).resolves.toBeUndefined();
    await expect(
      checkAiRateLimit(redis, userId, { ...DEFAULT_RATE_LIMIT, burst: 1 }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('releaseBurst decrements the burst counter', async () => {
    const redis = makeRedis();
    await releaseBurst(redis as any, userId);
    expect(redis.decr).toHaveBeenCalledWith(`rl:ai:b:${userId}`);
  });

  it('releaseBurst clamps the counter at 0 if it would go negative', async () => {
    const redis = makeRedis();
    (redis.decr as jest.Mock).mockResolvedValueOnce(-1);
    await releaseBurst(redis as any, userId);
    expect(redis.set).toHaveBeenCalledWith(`rl:ai:b:${userId}`, 0);
  });
});
