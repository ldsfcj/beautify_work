import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { CODES } from '../codes';

interface CapturedResponse {
  status: jest.Mock;
  json: jest.Mock;
}

function makeHost(url = '/api/test'): { host: ArgumentsHost; res: CapturedResponse } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res: CapturedResponse = { status, json };
  const req = { url } as unknown as ArgumentsHost extends never ? never : { url: string };
  const host = {
    switchToHttp: () => ({
      getResponse: () => res,
      getRequest: () => req,
    }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('wraps a HttpException with string body into the envelope', () => {
    const { host, res } = makeHost('/api/x');
    const ex = new HttpException('bad', HttpStatus.BAD_REQUEST);
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: HttpStatus.BAD_REQUEST,
        message: 'bad',
        data: null,
        path: '/api/x',
        timestamp: expect.any(String),
      }),
    );
  });

  it('unwraps a HttpException with object body (code, message)', () => {
    const { host, res } = makeHost();
    const ex = new HttpException(
      { code: CODES.INSUFFICIENT_CREDITS, message: '积分不足' },
      HttpStatus.PAYMENT_REQUIRED,
    );
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: CODES.INSUFFICIENT_CREDITS,
        message: '积分不足',
        data: null,
      }),
    );
  });

  it('falls back to 500 / INTERNAL_ERROR for a generic Error', () => {
    const { host, res } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'boom',
        data: null,
      }),
    );
  });

  it('uses a generic message when the thrown value is neither Error nor HttpException', () => {
    const { host, res } = makeHost();
    filter.catch('string-throw', host);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 500, message: 'Internal Server Error' }),
    );
  });
});
