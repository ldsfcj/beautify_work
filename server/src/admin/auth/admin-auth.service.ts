import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AdminUser, AdminRole } from '../../entities/admin-user.entity';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

/** scrypt cost parameters. Matches the seed migration. */
const SCRYPT_OPTS = Object.freeze({ N: 16384, r: 8, p: 1 });
const SCRYPT_KEY_LEN = 64;
const SALT_LEN = 16;

export interface AdminLoginResult {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    role: 'admin' | 'super';
  };
}

export interface AdminProfile {
  id: string;
  username: string;
  role: 'admin' | 'super';
  lastLoginAt: Date | null;
}

/**
 * Back-office auth (username + password). Separate code path from the
 * customer `AuthService` so a leaked customer JWT can never grant admin
 * access. Admin tokens are signed with `type: 'admin'` + `role`, and
 * `AdminAuthGuard` enforces that on every request.
 *
 * Password storage: scrypt(salt, password) → 64 bytes. The full
 * `"<saltB64>.<hashB64>"` string lives in `admin_users.password_hash`.
 * No external bcrypt/argon dep — Node's built-in scrypt is NIST-approved
 * and tunable via SCRYPT_OPTS above.
 *
 * Token TTLs: access 4h, refresh 1d. Shorter than customer tokens
 * because admin actions (refund, config edit) carry higher blast
 * radius if a token leaks.
 */
@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly admins: Repository<AdminUser>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Username + password → access + refresh JWTs. Throws 401 on any
   * credential failure (no enumeration via distinct error codes).
   */
  async login(username: string, password: string): Promise<AdminLoginResult> {
    const admin = await this.admins.findOne({ where: { username } });
    if (!admin || !(await this.verifyPassword(password, admin.passwordHash))) {
      // Same message either way — don't leak which half was wrong.
      throw new UnauthorizedException('账号或密码错误');
    }

    admin.lastLoginAt = new Date();
    await this.admins.save(admin);

    return {
      token: await this.signAccess(admin.id, admin.role),
      refreshToken: await this.signRefresh(admin.id, admin.role),
      user: this.toUserDto(admin),
    };
  }

  /**
   * Trade a refresh token for a fresh access + refresh pair. Rejects
   * non-admin payloads (e.g. a customer refresh token with the same
   * signature key) so privilege escalation is impossible across the
   * two token namespaces.
   */
  async refresh(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken: string }> {
    let payload: { sub: string; type: string; role?: 'admin' | 'super' };
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }
    if (payload.type !== 'admin') {
      throw new ForbiddenException('需要管理员 refresh token');
    }
    const admin = await this.admins.findOneByOrFail({ id: payload.sub });
    return {
      token: await this.signAccess(admin.id, admin.role),
      refreshToken: await this.signRefresh(admin.id, admin.role),
    };
  }

  /** Sanitized profile for `GET /admin/me`. */
  async getProfile(id: string): Promise<AdminProfile> {
    const admin = await this.admins.findOneByOrFail({ id });
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      lastLoginAt: admin.lastLoginAt,
    };
  }

  /**
   * Stateless logout — JWTs are self-contained, so there's no server-side
   * session to clear. The frontend is responsible for dropping the
   * token. The endpoint exists so the frontend's `store.logout()` call
   * has a matching API surface (and so we can wire server-side
   * revocation later without changing the call site).
   */
  async logout(_id: string): Promise<{ ok: true }> {
    return { ok: true };
  }

  // ── helpers ────────────────────────────────────────────────────────

  private async signAccess(
    adminId: string,
    role: AdminRole,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: adminId, type: 'admin' as const, role },
      { expiresIn: this.config.get('jwt.expiresIn', '4h') },
    );
  }

  private async signRefresh(
    adminId: string,
    role: AdminRole,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: adminId, type: 'admin' as const, role },
      { expiresIn: this.config.get('jwt.refreshExpiresIn', '1d') },
    );
  }

  private toUserDto(admin: AdminUser): AdminLoginResult['user'] {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
    };
  }

  private async verifyPassword(
    plain: string,
    stored: string,
  ): Promise<boolean> {
    const [saltB64, hashB64] = stored.split('.');
    if (!saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(plain, salt, SCRYPT_KEY_LEN, SCRYPT_OPTS);
    if (actual.length !== expected.length) return false;
    // Constant-time comparison to defeat timing attacks.
    return timingSafeEqual(actual, expected);
  }

  /**
   * Hash a password using the same scrypt parameters the verifier
   * uses. Exported for the seed migration (and any future
   * "change password" flow) so the format stays in lockstep.
   */
  static async hashPassword(plain: string): Promise<string> {
    const salt = randomBytes(SALT_LEN);
    const hash = await scrypt(plain, salt, SCRYPT_KEY_LEN, SCRYPT_OPTS);
    return `${salt.toString('base64')}.${hash.toString('base64')}`;
  }
}
