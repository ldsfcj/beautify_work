import { ExecutionContext, CallHandler } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  it('wraps a non-null value into { code: 0, message: "ok", data }', async () => {
    const interceptor = new TransformInterceptor();
    const handler: CallHandler = { handle: () => of({ hello: 'world' }) };
    const ctx = {} as ExecutionContext;
    const result = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ code: 0, message: 'ok', data: { hello: 'world' } });
  });

  it('passes null/undefined through as `data`', async () => {
    const interceptor = new TransformInterceptor();
    const handler: CallHandler = { handle: () => of(null) };
    const result = await firstValueFrom(
      interceptor.intercept({} as ExecutionContext, handler),
    );
    expect(result).toEqual({ code: 0, message: 'ok', data: null });
  });

  it('preserves array payloads', async () => {
    const interceptor = new TransformInterceptor();
    const handler: CallHandler = { handle: () => of([1, 2, 3]) };
    const result = await firstValueFrom(
      interceptor.intercept({} as ExecutionContext, handler),
    );
    expect(result).toEqual({ code: 0, message: 'ok', data: [1, 2, 3] });
  });
});
