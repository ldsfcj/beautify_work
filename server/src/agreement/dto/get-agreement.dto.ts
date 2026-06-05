import { IsIn, IsOptional } from 'class-validator';
import { AgreementType } from '../agreement.service';

/**
 * Query DTO for `GET /api/agreement/current?type=`. ValidationPipe
 * with `transform: true` (set in main.ts) coerces + validates the
 * raw `?type=` string into one of the allowed enum values.
 */
export class GetAgreementDto {
  @IsOptional()
  @IsIn(['user', 'privacy'], { message: '协议类型必须为 user 或 privacy' })
  type?: AgreementType;
}
