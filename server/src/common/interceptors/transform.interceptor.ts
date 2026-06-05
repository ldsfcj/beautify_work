import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Standard API response envelope.
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * Wraps every successful response in `{ code: 0, message: 'ok', data }`.
 * Placeholder — final shape will be tuned in Task 5.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ({ code: 0, message: 'ok', data })));
  }
}
