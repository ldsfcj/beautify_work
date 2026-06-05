import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityNotFoundError, Repository } from 'typeorm';
import { SystemConfig } from '../entities/system-config.entity';
import { UserAgreement } from '../entities/user-agreement.entity';

/** Wire keys for the seeded protocol entries. `system_configs.value` is
 *  a jsonb object of shape `{v: string, content: string}`. */
export const PROTOCOL_KEYS = {
  user: 'protocols.user',
  privacy: 'protocols.privacy',
} as const;

export type AgreementType = keyof typeof PROTOCOL_KEYS;

interface ProtocolValue {
  v: string;
  content: string;
}

@Injectable()
export class AgreementService {
  constructor(
    @InjectRepository(SystemConfig) private readonly configs: Repository<SystemConfig>,
    @InjectRepository(UserAgreement) private readonly agreements: Repository<UserAgreement>,
  ) {}

  /**
   * Return the current version + body for an agreement type. The version
   * is always read from `system_configs.protocols.<type>` so the client
   * cannot pin an old version (Task 12 design).
   */
  async getCurrent(type: AgreementType): Promise<{
    type: AgreementType;
    version: string;
    content: string;
  }> {
    if (!PROTOCOL_KEYS[type]) {
      // Defense in depth — the controller's DTO already rejects unknown
      // types, but a programmatic caller (e.g. a future cron) could
      // still pass a bad value. Surface as 404 not as a confusing
      // "key: undefined" SQL error.
      throw new NotFoundException(`协议 ${type} 未配置`);
    }
    const cfg = await this.fetchConfig(type);
    const value = cfg.value as ProtocolValue;
    return { type, version: value.v, content: value.content };
  }

  /**
   * Record a user acceptance. The version is sourced from system_configs
   * (not the body) so accept() is always pinned to the latest published
   * agreement. Idempotent: the UNIQUE(user_id, type, version) index plus
   * `orIgnore()` makes a re-acceptance a no-op.
   */
  async accept(userId: string, type: AgreementType): Promise<{ ok: true; version: string }> {
    const { version } = await this.getCurrent(type);
    await this.agreements
      .createQueryBuilder()
      .insert()
      // QueryBuilder.values() takes entity property names (camelCase);
      // TypeORM translates to the snake_case column names.
      .values({ userId, type, version })
      .orIgnore()
      .execute();
    return { ok: true, version };
  }

  /**
   * Wrap `findOneByOrFail` so a missing key surfaces as Nest's
   * `NotFoundException` (404) instead of TypeORM's `EntityNotFoundError`
   * (which the global exception filter maps to 500).
   */
  private async fetchConfig(type: AgreementType): Promise<SystemConfig> {
    try {
      return await this.configs.findOneByOrFail({ key: PROTOCOL_KEYS[type] });
    } catch (err) {
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(`协议 ${type} 未配置`);
      }
      throw err;
    }
  }
}
