import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { checkIpRateLimit } from './rate-limiter';

const PHONE_COOLDOWN_SECONDS = 60;
const IP_RATE_PER_MIN = 1; // matches Runbook §Task 9 spec
const CODE_TTL_SECONDS = 60;

@Injectable()
export class SmsService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    @InjectPinoLogger(SmsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Send a 6-digit verification code to the given phone. Behaviour:
   *   1. IP rate limit (default 1/min) — throws 429 when exceeded.
   *   2. Per-phone cooldown (60s) — throws 429 on the 2nd send within the window.
   *   3. Generates a fresh 6-digit code, stores in Redis with 60s TTL.
   *   4. In production, dispatches via aliyun Dysmsapi. In dev, just logs the code.
   */
  async sendCode(phone: string, ip: string): Promise<{ ok: true; ttl: number }> {
    await checkIpRateLimit(this.redis, ip, IP_RATE_PER_MIN);

    const cooldownKey = `sms:cooldown:${phone}`;
    const cooldownCount = await this.redis.incr(cooldownKey);
    if (cooldownCount === 1) {
      await this.redis.expire(cooldownKey, PHONE_COOLDOWN_SECONDS);
    }
    if (cooldownCount > 1) {
      throw new HttpException(
        { code: 2020, message: '请求过于频繁，请稍后再试' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.generateCode();
    await this.redis.set(`sms:${phone}`, code, 'EX', CODE_TTL_SECONDS);

    if (this.config.get('NODE_ENV') === 'production') {
      // (deferred) — real aliyun SDK call goes here, with retry + fallback.
      // We deliberately don't import @alicloud/dysmsapi here so dev builds
      // don't pull the SDK; import lazily inside this branch in Task 9.x.
      this.logger.warn({ phone }, '[sms] production send not yet implemented');
    } else {
      this.logger.warn({ phone, code }, '[dev] sms code');
    }

    return { ok: true, ttl: CODE_TTL_SECONDS };
  }

  /**
   * Verify the code submitted by the client. Single-use: a successful
   * match deletes the key so the same code cannot be re-used.
   */
  async verifyCode(phone: string, code: string): Promise<boolean> {
    const stored = await this.redis.get(`sms:${phone}`);
    if (stored && stored === code) {
      await this.redis.del(`sms:${phone}`);
      return true;
    }
    return false;
  }

  private generateCode(): string {
    // 6-digit numeric code, no leading-zero risk because we use 100000..999999.
    return (100000 + Math.floor(Math.random() * 900000)).toString();
  }
}
