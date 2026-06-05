// Tests for shared middlewares: auth, adminAuth, errorHandler
// All external dependencies (wx-server-sdk, jwt, logger) are mocked.

const wxServerSdkMock = {
  OPENID: 'mock_openid',
};

let mockUser = null; // null = first-login (auto-create); object = existing user
let lastInsert = null;
let lastUpdate = null;

jest.mock('wx-server-sdk', () => ({
  getWXContext: () => ({ OPENID: wxServerSdkMock.OPENID }),
  database: () => ({
  database: () => ({
    collection: (name) => ({
      where: () => ({
        limit: () => ({
          get: async () => ({ data: mockUser ? [mockUser] : [] }),
        }),
      }),
      add: async (doc) => {
        lastInsert = { collection: name, doc };
        return { id: 'new_user_id' };
      },
      doc: (id) => ({
        update: async (patch) => {
          lastUpdate = { id, patch };
        },
      }),
    }),
  }),
}));

const { resolveContext } = require('../../../../cloudfunctions/_shared/middlewares/auth');
const { requireAdmin } = require('../../../../cloudfunctions/_shared/middlewares/adminAuth');
const { withErrorHandler } = require('../../../../cloudfunctions/_shared/middlewares/errorHandler');
const { CODES, ok } = require('../../../../cloudfunctions/_shared/utils/response');

// ---------------------------------------------------------------------------
// auth.resolveContext
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUser = null;
  lastInsert = null;
  lastUpdate = null;
  wxServerSdkMock.OPENID = 'mock_openid';
  // Set a JWT secret for the admin tests
  process.env.JWT_SECRET = 'test-secret';
});

test('resolveContext: auto-creates user on first login', async () => {
  const ctx = await resolveContext({}, {});
  expect(ctx.openid).toBe('mock_openid');
  expect(ctx.userId).toBe('new_user_id');
  expect(lastInsert).not.toBeNull();
  expect(lastInsert.collection).toBe('users');
  expect(lastInsert.doc.openid).toBe('mock_openid');
  expect(lastInsert.doc.credits).toBe(0);
  expect(lastInsert.doc.status).toBe('active');
});

test('resolveContext: updates last_login_at for existing user', async () => {
  mockUser = { _id: 'existing_id', openid: 'mock_openid', credits: 50, status: 'active' };
  const ctx = await resolveContext({}, {});
  expect(ctx.userId).toBe('existing_id');
  expect(ctx.openid).toBe('mock_openid');
  expect(lastInsert).toBeNull();
  expect(lastUpdate).not.toBeNull();
  expect(lastUpdate.id).toBe('existing_id');
  expect(lastUpdate.patch.data.last_login_at).toBeInstanceOf(Date);
});

test('resolveContext: throws 401 when OPENID missing', async () => {
  wxServerSdkMock.OPENID = null;
  await expect(resolveContext({}, {})).rejects.toMatchObject({
    message: '未登录',
    code: 401,
  });
});

test('resolveContext: throws 403 when user banned', async () => {
  mockUser = { _id: 'banned_id', openid: 'mock_openid', status: 'banned' };
  await expect(resolveContext({}, {})).rejects.toMatchObject({
    message: '账号已被封禁',
    code: 403,
  });
});

// ---------------------------------------------------------------------------
// adminAuth.requireAdmin
// ---------------------------------------------------------------------------

test('requireAdmin: returns adminId for valid super token', async () => {
  const { sign } = require('../../../../cloudfunctions/_shared/utils/jwt');
  const token = sign({ sub: 'admin_1', role: 'super' });
  const ctx = await requireAdmin({ token });
  expect(ctx.adminId).toBe('admin_1');
  expect(ctx.role).toBe('super');
});

test('requireAdmin: accepts token under _token (HTTP trigger convention)', async () => {
  const { sign } = require('../../../../cloudfunctions/_shared/utils/jwt');
  const token = sign({ sub: 'admin_2', role: 'super' });
  const ctx = await requireAdmin({ _token: token });
  expect(ctx.adminId).toBe('admin_2');
});

test('requireAdmin: throws 401 when no token', async () => {
  await expect(requireAdmin({})).rejects.toMatchObject({
    message: '未登录',
    code: 401,
  });
});

test('requireAdmin: throws 401 when token invalid', async () => {
  await expect(requireAdmin({ token: 'garbage' })).rejects.toMatchObject({
    message: 'token 失效',
    code: 401,
  });
});

test('requireAdmin: throws 403 when role is not super', async () => {
  const { sign } = require('../../../../cloudfunctions/_shared/utils/jwt');
  const token = sign({ sub: 'staff_1', role: 'staff' });
  await expect(requireAdmin({ token })).rejects.toMatchObject({
    message: '权限不足',
    code: 403,
  });
});

// ---------------------------------------------------------------------------
// errorHandler.withErrorHandler
// ---------------------------------------------------------------------------

test('withErrorHandler: passes through success result', async () => {
  const handler = jest.fn(async () => ok({ hello: 'world' }));
  const wrapped = withErrorHandler(handler);
  const result = await wrapped({}, {});
  expect(result).toEqual({ code: 0, message: 'ok', data: { hello: 'world' } });
  expect(handler).toHaveBeenCalledTimes(1);
});

test('withErrorHandler: catches and formats thrown error', async () => {
  const handler = jest.fn(async () => {
    throw Object.assign(new Error('boom'), { code: CODES.NOT_FOUND });
  });
  const wrapped = withErrorHandler(handler);
  const result = await wrapped({}, {});
  expect(result).toEqual({ code: 404, message: 'boom', data: null });
});

test('withErrorHandler: defaults to INTERNAL when error has no code', async () => {
  const handler = jest.fn(async () => {
    throw new Error('unexpected');
  });
  const wrapped = withErrorHandler(handler);
  const result = await wrapped({}, {});
  expect(result.code).toBe(CODES.INTERNAL);
  expect(result.message).toBe('unexpected');
});

test('withErrorHandler: returns rejected promise when handler returns rejected', async () => {
  const handler = jest.fn(async () => {
    throw Object.assign(new Error('async-boom'), { code: CODES.UPSTREAM });
  });
  const wrapped = withErrorHandler(handler);
  const result = await wrapped({}, {});
  expect(result).toEqual({ code: 502, message: 'async-boom', data: null });
});
