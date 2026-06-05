import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SmsService } from '../sms/sms.service';
import { CryptoService } from '../crypto/crypto.service';
import { User } from '../entities/user.entity';
import { UserStatus } from '../entities/user.entity';

/**
 * AuthService unit tests. All collaborators are mocked; the focus is the
 * login flow's branching (new user / existing / banned) and the JWT
 * shape returned to the controller.
 */
describe('AuthService', () => {
  let service: AuthService;
  let sms: { verifyCode: jest.Mock };
  let users: {
    findOne: jest.Mock;
    findOneByOrFail: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };

  // Fixed crypto service (real instance — 32-byte 'a' * 32 key).
  let crypto: CryptoService;

  beforeEach(async () => {
    sms = { verifyCode: jest.fn() };
    users = {
      findOne: jest.fn(),
      findOneByOrFail: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn(async (entity) => ({ id: 'u-new', ...entity })),
    };
    jwt = {
      signAsync: jest.fn(async (payload, opts) =>
        // Encode the call for assertion: <alg>:<sub>:<type>:<expiresIn>
        `jwt(${payload.sub}|${payload.type}|${opts?.expiresIn})`,
      ),
      verifyAsync: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SmsService, useValue: sms },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => {
              const map: Record<string, unknown> = { 'encrypt.key': 'a'.repeat(32) };
              return key in map ? map[key] : fallback;
            },
          },
        },
        CryptoService,
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    crypto = moduleRef.get(CryptoService);
  });

  describe('login', () => {
    it('throws Unauthorized when the SMS code is wrong', async () => {
      sms.verifyCode.mockResolvedValue(false);
      await expect(service.login('13800138000', '000000')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('creates a new user on first login with default nickname + 0 credits', async () => {
      sms.verifyCode.mockResolvedValue(true);
      users.findOne.mockResolvedValue(null);

      const result = await service.login('13800138000', '123456');

      expect(users.create).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneHash: crypto.hashPhone('13800138000'),
          nickname: '用户8000',
          credits: 0,
          status: UserStatus.ACTIVE,
        }),
      );
      expect(users.save).toHaveBeenCalledTimes(1);
      expect(result.user.id).toBe('u-new');
      expect(result.user.nickname).toBe('用户8000');
      expect(result.user.credits).toBe(0);
      expect(result.user.phone_mask).toBe('138****8000');
    });

    it('returns the existing user without re-creating', async () => {
      sms.verifyCode.mockResolvedValue(true);
      users.findOne.mockResolvedValue({
        id: 'u-1',
        phoneHash: 'h',
        phoneEncrypted: crypto.encrypt('13800138000'),
        nickname: '老用户',
        credits: 42,
        status: UserStatus.ACTIVE,
      });

      const result = await service.login('13800138000', '123456');
      expect(users.create).not.toHaveBeenCalled();
      expect(result.user.id).toBe('u-1');
      expect(result.user.credits).toBe(42);
      expect(result.user.nickname).toBe('老用户');
    });

    it('throws Forbidden for banned accounts', async () => {
      sms.verifyCode.mockResolvedValue(true);
      users.findOne.mockResolvedValue({
        id: 'u-1',
        phoneHash: 'h',
        phoneEncrypted: 'enc',
        nickname: 'x',
        credits: 0,
        status: UserStatus.BANNED,
      });
      await expect(service.login('13800138000', '123456')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws Forbidden for pending_delete accounts', async () => {
      sms.verifyCode.mockResolvedValue(true);
      users.findOne.mockResolvedValue({
        id: 'u-1',
        status: UserStatus.PENDING_DELETE,
      });
      await expect(service.login('13800138000', '123456')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('signs both access and refresh tokens with distinct expiries', async () => {
      sms.verifyCode.mockResolvedValue(true);
      users.findOne.mockResolvedValue({
        id: 'u-1',
        phoneEncrypted: crypto.encrypt('13800138000'),
        nickname: 'x',
        credits: 0,
        status: UserStatus.ACTIVE,
      });

      const result = await service.login('13800138000', '123456');
      expect(result.token).toMatch(/^jwt\(u-1\|user\|/);
      expect(result.refreshToken).toMatch(/^jwt\(u-1\|user\|/);
      // access uses 30m, refresh uses 7d
      const access = jwt.signAsync.mock.calls[0];
      const refresh = jwt.signAsync.mock.calls[1];
      expect(access[1]?.expiresIn).toBe('30m');
      expect(refresh[1]?.expiresIn).toBe('7d');
    });
  });

  describe('refresh', () => {
    it('issues a new access + refresh pair after verifying the old refresh token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', type: 'user' });
      users.findOneByOrFail.mockResolvedValue({
        id: 'u-1',
        phoneEncrypted: crypto.encrypt('13800138000'),
        nickname: 'x',
        credits: 5,
        status: UserStatus.ACTIVE,
      });

      const result = await service.refresh('old-refresh-token');
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(jwt.verifyAsync).toHaveBeenCalledWith('old-refresh-token');
    });

    it('throws Unauthorized when the refresh token cannot be verified', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(service.refresh('bogus')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
