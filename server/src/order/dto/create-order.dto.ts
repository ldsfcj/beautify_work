import { IsEnum, IsUUID } from 'class-validator';
import { PaymentMethod } from '../../entities/order.entity';

/**
 * Body for `POST /api/order/create`. The package is referenced by
 * UUID (not by name) so a UI rename doesn't break in-flight carts.
 * `method` is restricted to the two providers currently wired (Task
 * 16/17 add the real SDKs; Task 15 ships a dev mock for both).
 */
export class CreateOrderDto {
  @IsUUID('4', { message: 'packageId 必须为 UUID v4' })
  packageId!: string;

  @IsEnum(PaymentMethod, { message: 'method 必须为 wechat 或 alipay' })
  method!: PaymentMethod;
}
