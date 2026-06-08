import { IsEnum, IsOptional } from 'class-validator';
import { GenerationStatus } from '../../entities/generation.entity';

/**
 * Query / body DTOs for the read-side generate endpoints.
 * Kept tiny — the controller passes these straight to the
 * service. Heavy validation belongs in the service (e.g.
 * `pageSize` clamp to 50).
 */
export class GenerateStatus {
  @IsOptional()
  @IsEnum(GenerationStatus)
  status?: GenerationStatus;
}
