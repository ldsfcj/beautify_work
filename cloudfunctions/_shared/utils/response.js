// 统一响应格式：所有云函数入口返回的 { code, message, data } 信封
// 业务侧按 code 判定成功（0）/失败（非 0），message 用于提示用户，data 携带业务数据
const CODES = {
  OK: 0, UNAUTHORIZED: 401, INSUFFICIENT_CREDITS: 402, FORBIDDEN: 403,
  NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429,
  INTERNAL: 500, UPSTREAM: 502, MAINTENANCE: 503,
};
function ok(data = null) { return { code: CODES.OK, message: 'ok', data }; }
function fail(code, message, data = null) { return { code, message, data }; }
module.exports = { CODES, ok, fail };
