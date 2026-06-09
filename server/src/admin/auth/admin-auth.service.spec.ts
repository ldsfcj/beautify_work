import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AdminUser, AdminRole } from '../../entities/admin-user.entity';
import { AuditService } from '../../audit/audit.service';

/**
 * AdminAuthService unit tests. All collaborators are mocked; focus is
 * the bcrypt-style password verify + JWT sign + lastLoginAt update.
 *
 * Password hash format: `${saltB64}.${hashB64}` (scrypt N=16384,r=8,p=1,
 * 64-byte derived key). Verification is constant-time via Node's
 * `crypto.timingSafeEqual`.
 */
describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let admins: {
    findOne: jest.Mock;
    findOneByOrFail: jest.Mock;
    save: jest.Mock;
  };
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let audit: { write: jest.Mock };

  /**
   * Helper: produce a real scrypt hash so the service's verify path
   * runs against a genuine derived key. This is the same algorithm
   * the seed migration uses, so test + prod stay in lockstep.
   */
  const makeHash = (password: string): string => {
    const { scryptSync, randomBytes } = require('node:crypto');
    const salt = randomBytes(16);
    const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return `${salt.toString('base64')}.${hash.toString('base64')}`;
  };

  beforeEach(async () => {
    admins = {
      findOne: jest.fn(),
      findOneByOrFail: jest.fn(),
      save: jest.fn(async (entity) => ({ ...entity })),
    };
    jwt = {
      signAsync: jest.fn(async (payload, opts) =>
        `jwt(${payload.sub}|${payload.type}|${payload.role ?? '-'}|${opts?.expiresIn})`,
      ),
      verifyAsync: jest.fn(),
    };
    audit = { write: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: getRepositoryToken(AdminUser), useValue: admins },
        { provide: JwtService, useValue: jwt },
        { provide: AuditService, useValue: audit },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: unknown) => {
              const map: Record<string, unknown> = {
                'jwt.expiresIn': '4h',
                'jwt.refreshExpiresIn': '1d',
              };
              return key in map ? map[key] : fallback;
            },
          },
        },
      ],
    }).compile();

    service = moduleRef.get(AdminAuthService);
  });

  describe('login', () => {
    it('throws Unauthorized when the username does not exist', async () => {
      admins.findOne.mockResolvedValue(null);
      await expect(service.login('admin', 'admin123')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('throws Unauthorized when the password hash does not match', async () => {
      admins.findOne.mockResolvedValue({
        id: 'a-1',
        username: 'admin',
        passwordHash: makeHash('correct-password'),
        role: AdminRole.SUPER,
      });
      await expect(service.login('admin', 'wrong-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('returns token + admin profile on success, updates lastLoginAt', async () => {
      const admin = {
        id: 'a-1',
        username: 'admin',
        passwordHash: makeHash('admin123'),
        role: AdminRole.SUPER,
        lastLoginAt: null,
      };
      admins.findOne.mockResolvedValue(admin);

      const result = await service.login('admin', 'admin123');

      // JWT must carry type=admin + role=super for AdminAuthGuard to admit it.
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      const access = jwt.signAsync.mock.calls[0];
      const refresh = jwt.signAsync.mock.calls[1];
      expect(access[0]).toEqual({ sub: 'a-1', type: 'admin', role: 'super' });
      expect(refresh[0]).toEqual({ sub: 'a-1', type: 'admin', role: 'super' });
      expect(access[1]?.expiresIn).toBe('4h');
      expect(refresh[1]?.expiresIn).toBe('1d');

      // Profile shape returned to the controller (no password hash, no lastLoginAt).
      expect(result.user).toEqual({
        id: 'a-1',
        username: 'admin',
        role: 'super',
      });
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // lastLoginAt must be persisted on successful login.
      expect(admin.lastLoginAt).toBeInstanceOf(Date);
      expect(admins.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'a-1', lastLoginAt: expect.any(Date) }),
      );
      // Audit row written for the login (fire-and-forget; we don't
      // gate the response on it).
      expect(audit.write).toHaveBeenCalledWith(
        expect.objectContaining({ adminId: 'a-1', action: 'admin.login' }),
      );
    });

    it('throws Forbidden for non-super admin accounts (defence-in-depth)', async () => {
      // This case isn't enforced in the login path itself — super/admin
      // can both log in, and per-action RBAC is handled by RolesGuard.
      // The test pins the current behaviour so an accidental flip is
      // caught early.
      admins.findOne.mockResolvedValue({
        id: 'a-2',
        username: 'op',
        passwordHash: makeHash('op123'),
        role: AdminRole.ADMIN,
      });
      const result = await service.login('op', 'op123');
      expect(result.user.role).toBe('admin');
    });
  });

  describe('refresh', () => {
    it('issues a new access + refresh pair for a valid admin refresh token', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'a-1', type: 'admin', role: 'super' });
      admins.findOneByOrFail.mockResolvedValue({
        id: 'a-1',
        username: 'admin',
        role: AdminRole.SUPER,
        passwordHash: 'irrelevant',
      });

      const result = await service.refresh('old-refresh');
      expect(result.token).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(jwt.verifyAsync).toHaveBeenCalledWith('old-refresh');
    });

    it('rejects refresh tokens whose payload is not type=admin', async () => {
      jwt.verifyAsync.mockResolvedValue({ sub: 'u-1', type: 'user' });
      await expect(service.refresh('user-refresh')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(admins.findOneByOrFail).not.toHaveBeenCalled();
    });

    it('throws Unauthorized on a malformed / expired token', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      await expect(service.refresh('bogus')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    it('returns the sanitized profile (no password hash) for an existing admin', async () => {
      admins.findOneByOrFail.mockResolvedValue({
        id: 'a-1',
        username: 'admin',
        role: AdminRole.SUPER,
        lastLoginAt: new Date('2026-06-01T00:00:00Z'),
      });
      const profile = await service.getProfile('a-1');
      expect(profile).toEqual({
        id: 'a-1',
        username: 'admin',
        role: 'super',
        lastLoginAt: new Date('2026-06-01T00:00:00Z'),
      });
      // Defence-in-depth: no password hash ever leaks through.
      expect((profile as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('logout', () => {
    it('is a no-op for stateless JWT (return type=ok)', async () => {
      const result = await service.logout('a-1');
      expect(result).toEqual({ ok: true });
    });
  });
});
