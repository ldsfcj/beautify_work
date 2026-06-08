import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { GenerationStatus } from '../../entities/generation.entity';

/**
 * Query params for `GET /api/generate/list`. `class-validator`
 * enforces the type at the controller boundary so the service
 * can trust `page` and `pageSize` are integers.
 *
 * `page` is 1-indexed to match what the frontend pagination
 * component already shows the user.
 */
export class GenerateListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsEnum(GenerationStatus)
  status?: GenerationStatus;
}
