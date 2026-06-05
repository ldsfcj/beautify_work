import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * Wraps every successful response in `{ code: 0, message: 'ok', data }`,
 * UNLESS the handler is marked with `@SkipTransform()` — used for
 * routes that must return a provider-mandated raw payload (e.g. Wechat
 * XML / Alipay "success" payment notify acks).
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    // The interceptor is sometimes wired without a full ExecutionContext
    // (older smoke tests pass `{}`), so we read metadata defensively.
    const handler =
      typeof context?.getHandler === 'function' ? context.getHandler() : null;
    const cls =
      typeof context?.getClass === 'function' ? context.getClass() : null;
    const skip =
      (handler && Reflect.getMetadata(SKIP_TRANSFORM_KEY, handler)) ||
      (cls && Reflect.getMetadata(SKIP_TRANSFORM_KEY, cls));

    if (skip) {
      return next.handle();
    }
    return next.handle().pipe(map((data) => ({ code: 0, message: 'ok', data })));
  }
}
