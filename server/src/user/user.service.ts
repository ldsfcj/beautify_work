import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { CryptoService } from '../crypto/crypto.service';
import { User, UserStatus } from '../entities/user.entity';

const REVOCATION_TTL_SECONDS = 7 * 86400; // covers max refresh token lifetime
const CANCELLATION_GRACE_DAYS = 30;

export interface UserDto {
  id: string;
  nickname: string | null;
  phone_mask: string;
  credits: number;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Read-only profile for the authenticated user. The phone is decoded
   * only long enough to produce the mask, never returned in the clear.
   */
  async getMe(userId: string): Promise<UserDto> {
    const u = await this.users.findOneByOrFail({ id: userId });
    return this.toDto(u);
  }

  /**
   * Update mutable profile fields. Currently just nickname; address /
   * avatar are out of scope for this task.
   */
  async updateMe(userId: string, dto: { nickname?: string }): Promise<UserDto> {
    const fields: Record<string, unknown> = {};
    if (dto.nickname !== undefined) fields.nickname = dto.nickname;
    await this.users.update(userId, fields);
    return this.getMe(userId);
  }

  /**
   * Soft-delete the account. Sets `status=pending_delete` immediately so
   * subsequent logins / refreshes are refused, and schedules a hard
   * delete 30 days out (cron in Task 11.x). The Redis revocation list
   * lets JwtAuthGuard invalidate access tokens issued *before* the
   * cancel timestamp.
   */
  async cancel(userId: string): Promise<{ ok: true; delete_at: Date }> {
    const now = new Date();
    const deleteAt = new Date(
      now.getTime() +
        this.config.get<number>('user.cancellation_grace_days', CANCELLATION_GRACE_DAYS) *
          86400_000,
    );
    await this.users.update(userId, {
      status: UserStatus.PENDING_DELETE,
      deletedAt: now,
      deleteAt,
    });
    // Revoke all live access tokens (≤ 30m) + refresh tokens (≤ 7d) by
    // recording the cancel timestamp. JwtAuthGuard compares against
    // token.iat to decide validity.
    await this.redis.set(
      `user:cancelled:${userId}`,
      now.getTime().toString(),
      'EX',
      REVOCATION_TTL_SECONDS,
    );
    return { ok: true, delete_at: deleteAt };
  }

  private toDto(u: User): UserDto {
    let phone = '';
    try {
      phone = this.crypto.decrypt(u.phoneEncrypted);
    } catch {
      // Corrupt ciphertext — surface as empty mask rather than 500ing.
      phone = '';
    }
    return {
      id: u.id,
      nickname: u.nickname,
      phone_mask: phone ? this.crypto.maskPhone(phone) : '****',
      credits: u.credits,
    };
  }
}
