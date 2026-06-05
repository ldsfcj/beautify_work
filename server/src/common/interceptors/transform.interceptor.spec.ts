import { ExecutionContext, CallHandler } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';
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

  it('bypasses the envelope when the handler has @SkipTransform metadata', async () => {
    const interceptor = new TransformInterceptor();
    const skipHandler = function skip() {};
    Reflect.defineMetadata(SKIP_TRANSFORM_KEY, true, skipHandler);
    const ctx = {
      getHandler: () => skipHandler,
      getClass: () => class Foo {},
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of('<xml>raw</xml>') };
    const result = await firstValueFrom(interceptor.intercept(ctx, handler));
    // No envelope — raw string flows through unchanged.
    expect(result).toBe('<xml>raw</xml>');
  });

  it('still wraps when the handler has no SkipTransform metadata', async () => {
    const interceptor = new TransformInterceptor();
    const plainHandler = function plain() {};
    const ctx = {
      getHandler: () => plainHandler,
      getClass: () => class Bar {},
    } as unknown as ExecutionContext;
    const handler: CallHandler = { handle: () => of({ ok: true }) };
    const result = await firstValueFrom(interceptor.intercept(ctx, handler));
    expect(result).toEqual({ code: 0, message: 'ok', data: { ok: true } });
  });
});
