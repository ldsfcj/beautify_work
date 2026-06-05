import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter. Converts any thrown error to a uniform
 * `{ code, message, data, path, timestamp }` JSON body.
 * Placeholder — final shape and logging will be tuned in Task 5.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal Server Error';
    let code = 500;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = status;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: string | object; code?: number };
        message = b.message ?? body;
        code = b.code ?? status;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.stack);
    }

    res.status(status).json({
      code,
      message,
      data: null,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
