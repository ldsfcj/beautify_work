// AES 字段加密：用于敏感字段（手机号/身份证）落库前加密、读取时解密
// 密钥走环境变量 FIELD_ENCRYPT_KEY（建议 16/24/32 字节）；不参与搜索，走精确匹配解密
const CryptoJS = require('crypto-js');

const KEY = process.env.FIELD_ENCRYPT_KEY;

function encrypt(plain) {
  return CryptoJS.AES.encrypt(plain, KEY).toString();
}

function decrypt(cipher) {
  return CryptoJS.AES.decrypt(cipher, KEY).toString(CryptoJS.enc.Utf8);
}

module.exports = { encrypt, decrypt };
