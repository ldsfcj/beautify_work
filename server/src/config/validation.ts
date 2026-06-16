import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Allowed values for NODE_ENV.
 */
export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Strongly-typed environment schema. Validated at boot via class-validator.
 * If any required field is missing or malformed, the process exits with a
 * descriptive error message.
 */
export class EnvVars {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  // Required fields are populated by plainToInstance at boot. The `!` asserts
  // the definite-assignment rule: validators below guarantee they are present.
  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @MinLength(32)
  FIELD_ENCRYPT_KEY!: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL!: string;

  @IsUrl({ require_tld: false })
  ADMIN_URL!: string;

  /**
   * Index signature — passes through every other env var
   * (TONGYI_API_KEY, OSS_ACCESS_KEY_*, SMS_ACCESS_KEY_*, etc.)
   * that isn't enumerated above. Without this, `whitelist: true`
   * in validate() strips them and `assignVariablesToProcess()`
   * never writes them to process.env, so `ConfigService.get(...)`
   * returns undefined for any undeclared key — including the
   * AI vendor key, which would silently route every call to
   * the no-key placeholder path.
   */
  [key: string]: unknown;
}

/**
 * Hook used by @nestjs/config. Throws on first validation failure so
 * misconfiguration is caught at startup, not at first request.
 */
export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, raw, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const formatted = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n  ');
    throw new Error(`Environment validation failed:\n  ${formatted}`);
  }
  return validated;
}
