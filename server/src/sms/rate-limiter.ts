import { HttpException, HttpStatus } from '@nestjs/common';
import type { Redis } from 'ioredis';

/**
 * Fixed-window IP rate limiter. Increments a per-IP counter and sets a
 * 60-second TTL on the first hit. If the counter exceeds `maxPerMin`,
 * throws a 429. The counter expires naturally so traffic is reset per
 * window — adequate for the SMS send abuse-prevention use case.
 *
 * Atomicity caveat: INCR + EXPIRE are two commands. Under heavy load
 * the EXPIRE may be lost (e.g. process crash between commands), letting
 * a counter live forever. Acceptable for SMS (worst case: a single
 * extra legitimate request slips through). For billing-grade limits
 * use a Lua script via `redis.eval`.
 */
export async function checkIpRateLimit(
  redis: Redis,
  ip: string,
  maxPerMin: number,
): Promise<void> {
  const key = `sms:ip:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    // First hit in the window — anchor the TTL.
    await redis.expire(key, 60);
  }
  if (count > maxPerMin) {
    throw new HttpException(
      { code: 2020, message: '请求过于频繁，请稍后再试' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
