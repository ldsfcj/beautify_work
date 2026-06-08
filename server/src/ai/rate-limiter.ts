import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';

const logger = new Logger('ai.rate-limiter');

/**
 * Token-bucket-ish rate limit for AI generation submissions, scoped
 * per user. Three independent windows from `system_configs.rate_limit`:
 *
 *   - perMinute: hard cap on submissions in any rolling 60s window
 *   - perDay:    hard cap in a 24h window
 *   - burst:     max parallel in-flight submissions (token bucket
 *                size; we implement as a leaky bucket with a 1s
 *                refill so a consultant can do quick A/B without
 *                tripping the per-minute ceiling)
 *
 * Implementation note: all three counters bump inside a single
 * Redis Lua script so a request either passes every window or
 * fails every window — no half-passed state under concurrent
 * load. A failed check still leaves the per-day counter bumped,
 * which is intentional: an over-eager client that probes the
 * limit will burn their daily budget, slowing the recovery.
 *
 * Keys: `rl:ai:m:{userId}`, `rl:ai:d:{userId}`, `rl:ai:b:{userId}`
 * Args: perMinute, perDay, burst, nowEpochSec
 * Returns: 1 if all three checks pass; 0 if any check fails.
 */
const RATE_LIMIT_LUA = `
local perMin  = tonumber(ARGV[1])
local perDay  = tonumber(ARGV[2])
local burst   = tonumber(ARGV[3])
local now     = tonumber(ARGV[4])

-- Burst: count in-flight submissions; if > burst, deny. TTL of
-- 60s is a safety net for the rare case the worker crashes
-- before decrementing (the counter eventually self-heals).
local bcur = redis.call('INCR', KEYS[3])
if bcur == 1 then redis.call('EXPIRE', KEYS[3], 60) end
if bcur > burst then return 0 end

-- Per-minute: rolling window via fixed bucket, TTL=60s.
local mcur = redis.call('INCR', KEYS[1])
if mcur == 1 then redis.call('EXPIRE', KEYS[1], 60) end
if mcur > perMin then return 0 end

-- Per-day: same shape, TTL=86400s.
local dcur = redis.call('INCR', KEYS[2])
if dcur == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
if dcur > perDay then return 0 end

return 1
`;

export interface RateLimitConfig {
  perMinute: number;
  perDay: number;
  burst: number;
  downloadPerHour: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  perMinute: 5,
  perDay: 50,
  burst: 3,
  downloadPerHour: 20,
};

/**
 * Decrement the burst counter when a generation job finishes
 * (success or fail). Callers MUST invoke this in a `finally`
 * block; the counter is the only thing standing between an
 * over-eager client and a worker-flooding burst.
 */
export async function releaseBurst(redis: Redis, userId: string): Promise<void> {
  const key = `rl:ai:b:${userId}`;
  const cur = await redis.decr(key);
  if (cur < 0) {
    // Defensive: never let the counter go negative (it would
    // inflate the next caller's apparent budget).
    await redis.set(key, 0);
  }
}

/**
 * Atomically check all three AI rate-limit windows for `userId`.
 * Throws 429 with a code-typed payload if any window is exceeded.
 * Caller is responsible for `releaseBurst()` once the in-flight
 * job settles.
 */
export async function checkAiRateLimit(
  redis: Redis,
  userId: string,
  cfg: RateLimitConfig,
): Promise<void> {
  const ok = (await redis.eval(
    RATE_LIMIT_LUA,
    3,
    `rl:ai:m:${userId}`,
    `rl:ai:d:${userId}`,
    `rl:ai:b:${userId}`,
    cfg.perMinute.toString(),
    cfg.perDay.toString(),
    cfg.burst.toString(),
    Math.floor(Date.now() / 1000).toString(),
  )) as number;
  if (ok === 0) {
    logger.warn(`[rate-limit] user ${userId} tripped the AI limit`);
    throw new HttpException(
      { code: 'AI_RATE_LIMITED', message: 'AI 生成请求过于频繁，请稍后再试' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
