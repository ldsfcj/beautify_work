import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsService } from '../sms/sms.service';
import { CryptoService } from '../crypto/crypto.service';
import { User, UserStatus } from '../entities/user.entity';

export interface AuthResult {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    nickname: string | null;
    phone_mask: string;
    credits: number;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly sms: SmsService,
    private readonly crypto: CryptoService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /**
   * Phone + SMS code → access + refresh JWTs. Creates a new user on
   * first login (status=active, credits=0, nickname=`用户${last4}`).
   */
  async login(phone: string, code: string): Promise<AuthResult> {
    const ok = await this.sms.verifyCode(phone, code);
    if (!ok) {
      throw new UnauthorizedException('验证码错误或已过期');
    }

    const phoneHash = this.crypto.hashPhone(phone);
    let user = await this.users.findOne({ where: { phoneHash } });

    if (!user) {
      user = this.users.create({
        phoneHash,
        phoneEncrypted: this.crypto.encrypt(phone),
        nickname: `用户${phone.slice(-4)}`,
        credits: 0,
        status: UserStatus.ACTIVE,
      });
      user = await this.users.save(user);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('账号已封禁或注销中');
    }

    return {
      token: await this.signAccess(user.id),
      refreshToken: await this.signRefresh(user.id),
      user: this.toDto(user, phone),
    };
  }

  /**
   * Trade a refresh token for a new access + refresh pair. Verifies the
   * old token's signature, looks up the user, re-signs. Throws 401 if
   * the token is invalid/expired or the user is gone.
   */
  async refresh(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    let payload: { sub: string; type: 'user' | 'admin' };
    try {
      payload = await this.jwt.verifyAsync(refreshToken);
    } catch {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }
    const user = await this.users.findOneByOrFail({ id: payload.sub });
    return {
      token: await this.signAccess(user.id),
      refreshToken: await this.signRefresh(user.id),
    };
  }

  private async signAccess(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: 'user' as const },
      { expiresIn: this.config.get('jwt.expiresIn', '30m') },
    );
  }

  private async signRefresh(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, type: 'user' as const },
      { expiresIn: this.config.get('jwt.refreshExpiresIn', '7d') },
    );
  }

  private toDto(user: User, phone: string): AuthResult['user'] {
    return {
      id: user.id,
      nickname: user.nickname,
      phone_mask: this.crypto.maskPhone(phone),
      credits: user.credits,
    };
  }
}
