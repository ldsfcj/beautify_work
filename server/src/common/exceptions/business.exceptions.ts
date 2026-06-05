import { HttpException, HttpStatus } from '@nestjs/common';
import { CODES } from '../codes';

/**
 * Throw a business exception with a domain `code` and an HTTP status.
 * The global HttpExceptionFilter unwraps `{code, message}` and emits
 * a uniform JSON envelope to the client.
 */
export class BusinessException extends HttpException {
  constructor(code: number, message: string, status: number = HttpStatus.BAD_REQUEST) {
    super({ code, message }, status);
  }
}

// ── 2xxx — business rules ─────────────────────────────────────────────
export const NotFoundException = (resource = 'resource') =>
  new BusinessException(CODES.NOT_FOUND, `${resource} 不存在`, HttpStatus.NOT_FOUND);

export const ConflictException = (msg = '资源冲突') =>
  new BusinessException(CODES.CONFLICT, msg, HttpStatus.CONFLICT);

export const AlreadyExistsException = (resource = 'resource') =>
  new BusinessException(CODES.ALREADY_EXISTS, `${resource} 已存在`, HttpStatus.CONFLICT);

export const InsufficientCreditsException = () =>
  new BusinessException(
    CODES.INSUFFICIENT_CREDITS,
    '积分不足，请先购买套餐',
    HttpStatus.PAYMENT_REQUIRED,
  );

export const RateLimitedException = (msg = '操作过于频繁，请稍后再试') =>
  new BusinessException(CODES.RATE_LIMITED, msg, HttpStatus.TOO_MANY_REQUESTS);

export const QuotaExceededException = (msg = '配额已用完') =>
  new BusinessException(CODES.QUOTA_EXCEEDED, msg, HttpStatus.TOO_MANY_REQUESTS);

export const StateInvalidException = (msg = '当前状态不允许该操作') =>
  new BusinessException(CODES.STATE_INVALID, msg, HttpStatus.CONFLICT);

// ── 3xxx — auth ──────────────────────────────────────────────────────
export const UnauthorizedException = (msg = '未登录或登录已过期') =>
  new BusinessException(CODES.UNAUTHORIZED, msg, HttpStatus.UNAUTHORIZED);

export const TokenExpiredException = () =>
  new BusinessException(CODES.TOKEN_EXPIRED, '登录已过期，请重新登录', HttpStatus.UNAUTHORIZED);

export const TokenInvalidException = () =>
  new BusinessException(CODES.TOKEN_INVALID, 'token 无效', HttpStatus.UNAUTHORIZED);

export const ForbiddenException = (msg = '权限不足') =>
  new BusinessException(CODES.FORBIDDEN, msg, HttpStatus.FORBIDDEN);

export const AccountBannedException = () =>
  new BusinessException(CODES.ACCOUNT_BANNED, '账号已被封禁', HttpStatus.FORBIDDEN);

export const AccountPendingDeleteException = () =>
  new BusinessException(
    CODES.ACCOUNT_PENDING_DELETE,
    '账号正在注销流程中',
    HttpStatus.FORBIDDEN,
  );

export const SmsCodeInvalidException = () =>
  new BusinessException(CODES.SMS_CODE_INVALID, '验证码错误或已过期', HttpStatus.BAD_REQUEST);

// ── 5xxx — server / upstream ──────────────────────────────────────────
export const InternalErrorException = (msg = '服务内部错误') =>
  new BusinessException(CODES.INTERNAL_ERROR, msg, HttpStatus.INTERNAL_SERVER_ERROR);

export const UpstreamTimeoutException = () =>
  new BusinessException(
    CODES.UPSTREAM_TIMEOUT,
    '上游服务超时，请稍后重试',
    HttpStatus.BAD_GATEWAY,
  );

export const AiGenerationFailedException = (msg = 'AI 生成失败') =>
  new BusinessException(CODES.AI_GENERATION_FAILED, msg, HttpStatus.BAD_GATEWAY);
