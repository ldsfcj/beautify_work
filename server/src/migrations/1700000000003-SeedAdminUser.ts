import { MigrationInterface, QueryRunner } from 'typeorm';
import { scrypt as scryptCb, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const SCRYPT_OPTS = Object.freeze({ N: 16384, r: 8, p: 1 });
const SCRYPT_KEY_LEN = 64;
const DEFAULT_PASSWORD = 'admin123';

/**
 * Seeds the default back-office account. The password is hashed with
 * the same scrypt params `AdminAuthService.verifyPassword` uses
 * (N=16384, r=8, p=1, 64-byte derived key), so a freshly-migrated DB
 * is immediately log-in-able with `admin / admin123`.
 *
 * Idempotent: ON CONFLICT (username) DO NOTHING means re-running
 * `migration:run` after a manual DB reset is safe. The super role
 * grants the bypass for refund-approval and config-edit guards; a
 * `super` account should never be left on a production deployment
 * with the default password — change it via `AdminUserService` once
 * the admin panel is online.
 */
export class SeedAdminUser1700000000003 implements MigrationInterface {
  name = 'SeedAdminUser1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const salt = randomBytes(16);
    const hash = await scrypt(DEFAULT_PASSWORD, salt, SCRYPT_KEY_LEN, SCRYPT_OPTS);
    const passwordHash = `${salt.toString('base64')}.${hash.toString('base64')}`;

    await queryRunner.query(
      `INSERT INTO admin_users (username, password_hash, role)
       VALUES ($1, $2, 'super')
       ON CONFLICT (username) DO NOTHING`,
      ['admin', passwordHash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Down-migrations on seed data are intentionally narrow: we only
    // remove the seed row, not the whole `admin_users` table (which
    // is owned by InitSchema and may have other rows by now).
    await queryRunner.query(`DELETE FROM admin_users WHERE username = 'admin'`);
  }
}
