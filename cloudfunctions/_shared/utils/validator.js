// zod 入参校验：云函数入口按 schema 名拿到解析后的对象，失败时 zod 抛 ZodError
// 业务侧在 errorHandler 统一捕获 ZodError 转为 400/INVALID_ARGUMENT
const { z } = require('zod');

const schemas = {
  login: z.object({ code: z.string().min(1) }),
  updateProfile: z.object({
    nickname: z.string().max(20).optional(),
    avatar: z.string().url().optional(),
  }),
};

function validate(name, input) {
  const s = schemas[name];
  if (!s) throw new Error(`Schema ${name} not found`);
  return s.parse(input);
}

module.exports = { validate, schemas };
