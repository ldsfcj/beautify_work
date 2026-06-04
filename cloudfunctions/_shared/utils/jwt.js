// JWT 签发/验证：管理后台（adminAuth 中间件）用，user openid 不走 JWT
// 密钥走环境变量 JWT_SECRET，签发时默认 30 天过期
const jwt = require('jsonwebtoken');

function sign(payload, expiresIn = '30d') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function verify(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { sign, verify };
