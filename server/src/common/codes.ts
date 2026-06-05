/**
 * Business error code table. Returned in the `code` field of every
 * BusinessException and in the global HTTP response envelope. Keep the
 * numeric range stable — clients switch on these values.
 *
 *   0         success
 *   1xxx      client input errors (4xx HTTP)
 *   2xxx      business-rule violations (still 4xx HTTP)
 *   3xxx      auth/permission errors
 *   5xxx      upstream / server errors
 */
export const CODES = {
  // Success
  SUCCESS: 0,

  // 1xxx — generic input errors
  INVALID_PARAMS: 1001,
  MISSING_FIELD: 1002,
  INVALID_FORMAT: 1003,

  // 2xxx — business rules
  NOT_FOUND: 2001,
  ALREADY_EXISTS: 2002,
  CONFLICT: 2003,
  STATE_INVALID: 2004,
  INSUFFICIENT_CREDITS: 2010,
  RATE_LIMITED: 2020,
  QUOTA_EXCEEDED: 2021,

  // 3xxx — auth
  UNAUTHORIZED: 3001,
  TOKEN_EXPIRED: 3002,
  TOKEN_INVALID: 3003,
  SMS_CODE_INVALID: 3010,
  SMS_CODE_EXPIRED: 3011,
  FORBIDDEN: 3030,
  ACCOUNT_BANNED: 3040,
  ACCOUNT_PENDING_DELETE: 3041,

  // 4xxx — payment
  PAYMENT_REQUIRED: 4001,
  PAYMENT_FAILED: 4002,
  REFUND_REJECTED: 4010,

  // 5xxx — server / upstream
  INTERNAL_ERROR: 5000,
  UPSTREAM_TIMEOUT: 5010,
  UPSTREAM_UNAVAILABLE: 5011,
  AI_GENERATION_FAILED: 5020,
} as const;

export type AppCode = (typeof CODES)[keyof typeof CODES];
