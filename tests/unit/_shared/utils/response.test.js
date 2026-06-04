const { ok, fail, CODES } = require('../../../../cloudfunctions/_shared/utils/response');

test('ok returns success envelope', () => {
  expect(ok({ a: 1 })).toEqual({ code: 0, message: 'ok', data: { a: 1 } });
});
test('fail returns error envelope', () => {
  expect(fail(CODES.NOT_FOUND, 'not found')).toEqual({
    code: 404, message: 'not found', data: null,
  });
});
