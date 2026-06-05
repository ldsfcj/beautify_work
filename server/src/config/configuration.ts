/**
 * Application configuration loaded by @nestjs/config.
 * Values are read from process.env (validated upstream in config/validation.ts).
 */
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  encrypt: {
    key: process.env.FIELD_ENCRYPT_KEY,
  },
  frontendUrl: process.env.FRONTEND_URL,
  adminUrl: process.env.ADMIN_URL,
});
