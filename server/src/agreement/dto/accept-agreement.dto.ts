import { IsIn } from 'class-validator';
import { AgreementType } from '../agreement.service';

/**
 * Body for `POST /api/agreement/accept`. The version is intentionally
 * NOT in the body — it is always read from `system_configs` on the
 * server (Task 12 design: client cannot pin an old version).
 */
export class AcceptAgreementDto {
  @IsIn(['user', 'privacy'], { message: '协议类型必须为 user 或 privacy' })
  type!: AgreementType;
}
