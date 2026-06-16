import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  BadGatewayException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import sharp from 'sharp';
import { TongyiAdapter } from './tongyi.adapter';

/**
 * Coverage:
 *   1. No API key → mock placeholder (grey 1024×1024 JPEG)
 *   2. API key present → full async flow (submit → poll → download)
 *   3. Dashscope 4xx → BadRequestException (no retry)
 *   4. Dashscope 5xx → BadGatewayException (retryable)
 *   5. Dashscope 429 → BadGatewayException (retryable)
 *   6. Task FAILED → BadGatewayException
 *   7. Poll timeout → GatewayTimeoutException
 *   8. Download failure → BadGatewayException
 */
describe('TongyiAdapter', () => {
  function makeAdapter(
    apiKey: string | null,
    httpMocks?: {
      post?: jest.Mock;
      get?: jest.Mock;
    },
  ): TongyiAdapter {
    const cfg = {
      get: jest.fn((k: string) => {
        if (k === 'TONGYI_API_KEY') return apiKey;
        return undefined;
      }),
    } as unknown as ConfigService;

    const http = {
      post: httpMocks?.post ?? jest.fn(),
      get: httpMocks?.get ?? jest.fn(),
    } as unknown as HttpService;

    return new TongyiAdapter(cfg, http);
  }

  /** Helper: create a fake AxiosResponse */
  function fakeResponse(
    data: any,
    status = 200,
  ): AxiosResponse {
    return {
      data,
      status,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    } as AxiosResponse;
  }

  // ── No API key → mock path ──────────────────────────────────

  it('no API key → returns synthesized placeholder', async () => {
    const adapter = makeAdapter(null);

    const result = await adapter.editImage({
      imageSignedUrl: 'https://example.invalid/x.jpg',
      prompt: 'subtle rhinoplasty',
    });

    const meta = await sharp(result.resultBuffer).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeGreaterThanOrEqual(512);
    expect(meta.height).toBeGreaterThanOrEqual(512);
    expect(result.modelUsed).toContain('mock');
    expect(result.costCents).toBeGreaterThan(0);
  });

  // ── Full happy path with API key ────────────────────────────

  it('API key present → submit → poll → download', async () => {
    const postMock = jest
      .fn()
      .mockReturnValueOnce(
        of(
          fakeResponse(
            { output: { task_id: 'task-123', task_status: 'PENDING' } },
            202,
          ),
        ),
      );

    const getMock = jest
      .fn()
      // First poll: still running
      .mockReturnValueOnce(
        of(
          fakeResponse({
            output: { task_id: 'task-123', task_status: 'RUNNING' },
          }),
        ),
      )
      // Second poll: succeeded
      .mockReturnValueOnce(
        of(
          fakeResponse({
            output: {
              task_id: 'task-123',
              task_status: 'SUCCEEDED',
              results: [{ url: 'https://result.example.com/img.png' }],
            },
          }),
        ),
      )
      // Download result image
      .mockReturnValueOnce(
        of(
          fakeResponse(
            Buffer.from('fake-image-data'),
            200,
          ),
        ),
      );

    const adapter = makeAdapter('sk-test-fake', {
      post: postMock,
      get: getMock,
    });

    // Speed up polling in tests by reducing sleep
    jest.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);

    const result = await adapter.editImage({
      imageSignedUrl: 'https://oss.example.com/input.jpg',
      prompt: 'subtle rhinoplasty',
    });

    expect(result.resultBuffer).toBeInstanceOf(Buffer);
    expect(result.modelUsed).toBe('wanx2.1-img2img');
    expect(result.costCents).toBe(4);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    // Verify submit call
    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toContain('image-synthesis');
    expect(body.model).toBe('wanx2.1-img2img');
    expect(body.input.image_url).toBe('https://oss.example.com/input.jpg');
    expect(body.input.prompt).toBe('subtle rhinoplasty');
    expect(config.headers.Authorization).toBe('Bearer sk-test-fake');
    expect(config.headers['X-DashScope-Async']).toBe('enable');

    // Verify poll + download calls
    expect(getMock).toHaveBeenCalledTimes(3); // 2 polls + 1 download
  });

  // ── Error: Dashscope 4xx ────────────────────────────────────

  it('Dashscope 4xx → BadRequestException (no retry)', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse(
          { message: 'InvalidParameter', request_id: 'req-1' },
          400,
        ),
      ),
    );

    const adapter = makeAdapter('sk-test-fake', { post: postMock });

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Error: Dashscope 5xx ────────────────────────────────────

  it('Dashscope 5xx → BadGatewayException (retryable)', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse(
          { message: 'InternalError' },
          500,
        ),
      ),
    );

    const adapter = makeAdapter('sk-test-fake', { post: postMock });

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Error: Dashscope 429 ────────────────────────────────────

  it('Dashscope 429 → BadGatewayException (retryable)', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse(
          { message: 'Throttling' },
          429,
        ),
      ),
    );

    const adapter = makeAdapter('sk-test-fake', { post: postMock });

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Error: Task FAILED ──────────────────────────────────────

  it('task FAILED → BadGatewayException', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse(
          { output: { task_id: 'task-fail', task_status: 'PENDING' } },
          202,
        ),
      ),
    );

    const getMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse({
          output: {
            task_id: 'task-fail',
            task_status: 'FAILED',
            message: 'ContentFilterBlocked',
          },
        }),
      ),
    );

    const adapter = makeAdapter('sk-test-fake', {
      post: postMock,
      get: getMock,
    });
    jest.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Error: Poll timeout ─────────────────────────────────────

  it('poll timeout → GatewayTimeoutException', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse(
          { output: { task_id: 'task-slow', task_status: 'PENDING' } },
          202,
        ),
      ),
    );

    // Poll always returns RUNNING (never SUCCEEDED)
    const getMock = jest.fn().mockReturnValue(
      of(
        fakeResponse({
          output: { task_id: 'task-slow', task_status: 'RUNNING' },
        }),
      ),
    );

    const adapter = makeAdapter('sk-test-fake', {
      post: postMock,
      get: getMock,
    });
    jest.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
  });

  // ── Error: Download failure ─────────────────────────────────

  it('download failure → BadGatewayException', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse(
          { output: { task_id: 'task-ok', task_status: 'PENDING' } },
          202,
        ),
      ),
    );

    const getMock = jest
      .fn()
      // Poll: succeeded
      .mockReturnValueOnce(
        of(
          fakeResponse({
            output: {
              task_id: 'task-ok',
              task_status: 'SUCCEEDED',
              results: [{ url: 'https://result.example.com/img.png' }],
            },
          }),
        ),
      )
      // Download: network error
      .mockReturnValueOnce(
        throwError(() => new Error('ECONNREFUSED')),
      );

    const adapter = makeAdapter('sk-test-fake', {
      post: postMock,
      get: getMock,
    });
    jest.spyOn(adapter as any, 'sleep').mockResolvedValue(undefined);

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Error: Submit network error ─────────────────────────────

  it('submit network error → BadGatewayException', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      throwError(() => new Error('ECONNRESET')),
    );

    const adapter = makeAdapter('sk-test-fake', { post: postMock });

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Adapter name ────────────────────────────────────────────

  it('exposes a stable adapter name', () => {
    const adapter = makeAdapter(null);
    expect(adapter.name).toBe('tongyi');
  });
});
