import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import sharp from 'sharp';
import { TongyiAdapter } from './tongyi.adapter';

/**
 * Coverage:
 *   1. No API key → mock placeholder (grey 1024×1024 JPEG)
 *   2. API key present → full sync flow (multimodal POST → image URL → GET download)
 *   3. Dashscope 4xx → BadRequestException (no retry)
 *   4. Dashscope 5xx → BadGatewayException (retryable)
 *   5. Dashscope 429 → BadGatewayException (retryable)
 *   6. Response without content array → BadGatewayException
 *   7. Response with content but no image part → BadGatewayException
 *   8. Download failure → BadGatewayException
 *   9. Network error on multimodal POST → BadGatewayException
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

  function fakeResponse(data: any, status = 200): AxiosResponse {
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

  it('API key present → multimodal POST → download result image', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse({
          output: {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: [
                    { image: 'https://result.example.com/img.png' },
                  ],
                },
              },
            ],
          },
        }),
      ),
    );

    const getMock = jest.fn().mockReturnValueOnce(
      of(fakeResponse(Buffer.from('fake-image-data'), 200)),
    );

    const adapter = makeAdapter('sk-test-fake', {
      post: postMock,
      get: getMock,
    });

    const result = await adapter.editImage({
      imageSignedUrl: 'https://oss.example.com/input.jpg',
      prompt: 'subtle rhinoplasty',
    });

    expect(result.resultBuffer).toBeInstanceOf(Buffer);
    expect(result.modelUsed).toBe('wan2.7-image');
    expect(result.costCents).toBe(4);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    // Verify multimodal POST shape
    expect(postMock).toHaveBeenCalledTimes(1);
    const [url, body, config] = postMock.mock.calls[0];
    expect(url).toContain('multimodal-generation/generation');
    expect(body.model).toBe('wan2.7-image');
    expect(body.input.messages).toHaveLength(1);
    expect(body.input.messages[0].role).toBe('user');
    const parts = body.input.messages[0].content;
    expect(parts).toHaveLength(2);
    expect(parts[0].image).toBe('https://oss.example.com/input.jpg');
    expect(parts[1].text).toBe('subtle rhinoplasty');
    expect(body.parameters.size).toBe('1024*1024');
    expect(config.headers.Authorization).toBe('Bearer sk-test-fake');

    // Verify one download call against the result URL
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0][0]).toBe('https://result.example.com/img.png');
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
      of(fakeResponse({ message: 'InternalError' }, 500)),
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
      of(fakeResponse({ message: 'Throttling' }, 429)),
    );

    const adapter = makeAdapter('sk-test-fake', { post: postMock });

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Error: response missing content array ──────────────────

  it('response without content array → BadGatewayException', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(fakeResponse({ output: { choices: [{}] } })),
    );

    const adapter = makeAdapter('sk-test-fake', { post: postMock });

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Error: content array but no image part ──────────────────

  it('content has no image part → BadGatewayException', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse({
          output: {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: [{ text: 'something' }],
                },
              },
            ],
          },
        }),
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

  // ── Error: Download failure ─────────────────────────────────

  it('download failure → BadGatewayException', async () => {
    const postMock = jest.fn().mockReturnValueOnce(
      of(
        fakeResponse({
          output: {
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: [{ image: 'https://result.example.com/img.png' }],
                },
              },
            ],
          },
        }),
      ),
    );

    const getMock = jest
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('ECONNREFUSED')));

    const adapter = makeAdapter('sk-test-fake', {
      post: postMock,
      get: getMock,
    });

    await expect(
      adapter.editImage({
        imageSignedUrl: 'https://example.com/x.jpg',
        prompt: 'test',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  // ── Error: Network error on multimodal POST ────────────────

  it('multimodal POST network error → BadGatewayException', async () => {
    const postMock = jest
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('ECONNRESET')));

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
