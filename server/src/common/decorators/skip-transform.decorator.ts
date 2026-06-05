import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key read by `TransformInterceptor` to bypass the standard
 * `{code, message, data}` envelope. Used when an endpoint must return
 * a provider-mandated raw payload (e.g. Wechat / Alipay payment notify
 * acks) or any other non-JSON response.
 */
export const SKIP_TRANSFORM_KEY = 'skipTransform';

/**
 * Opt a route handler out of the global response envelope. Pair with
 * `@Header('Content-Type', ...)` to control the outgoing MIME type.
 */
export const SkipTransform = (): MethodDecorator =>
  SetMetadata(SKIP_TRANSFORM_KEY, true);
