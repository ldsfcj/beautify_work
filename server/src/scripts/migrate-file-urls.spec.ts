import { rebaseUrl } from './migrate-file-urls';

/**
 * Pure-function tests for the URL rebase logic. The DB-touching
 * part of the migration is exercised end-to-end against the dev
 * database; the encoding/decoding edge cases are not.
 */
describe('rebaseUrl', () => {
  const ID = '778b34ea-e718-4408-9edf-3ad8071c76ab';

  it('returns null when the value is already canonical (dev-file URL)', () => {
    expect(
      rebaseUrl(`/api/oss/dev-file/gen/${ID}.jpg`, ID),
    ).toBeNull();
    expect(
      rebaseUrl(
        `/api/oss/dev-file/uploads/user-1/1781170297835_xsp38pn1.png`,
        ID,
      ),
    ).toBeNull();
  });

  it('leaves external (https) URLs alone — prod path', () => {
    expect(
      rebaseUrl('https://bucket.oss-cn-hangzhou.aliyuncs.com/gen/x.jpg', ID),
    ).toBeNull();
  });

  it('returns null for nullish input (no row to fix)', () => {
    expect(rebaseUrl(null, ID)).toBeNull();
    expect(rebaseUrl(undefined, ID)).toBeNull();
  });

  it('re-wraps a plain file:// result_url to gen/<id>.<ext>', () => {
    // The exact shape we saw in /tmp/worker.log: the dev fallback
    // returns `file:///abs/path/.oss-dev/gen/<id>.jpg`.
    const input = `file:///home/ubuntu/personal_work/server/.oss-dev/gen/${ID}.jpg`;
    expect(rebaseUrl(input, ID)).toBe(`/api/oss/dev-file/gen/${ID}.jpg`);
  });

  it('fixes the double-wrapped file%3A result_url that presentUrls produced', () => {
    // The shape that came back from the API after the read-path
    // wrap on top of a file:// stored value. Without this fix
    // the row stays broken — the script's whole reason to exist.
    const stored = `/api/oss/dev-file/file%3A///home/ubuntu/personal_work/server/.oss-dev/gen/${ID}.jpg`;
    expect(rebaseUrl(stored, ID)).toBe(`/api/oss/dev-file/gen/${ID}.jpg`);
  });

  it('re-wraps a file:// upload path to uploads/<userId>/<file>.<ext>', () => {
    const input =
      'file:///home/ubuntu/personal_work/server/.oss-dev/uploads/b7b9a563-8803-4ff8-901a-7cf38914deff/1781170297835_xsp38pn1.png';
    expect(rebaseUrl(input, ID)).toBe(
      '/api/oss/dev-file/uploads/b7b9a563-8803-4ff8-901a-7cf38914deff/1781170297835_xsp38pn1.png',
    );
  });

  it('encodes a bare OSS key (uploads/<userId>/<file>) as dev-file URL', () => {
    expect(
      rebaseUrl(
        'uploads/b7b9a563-8803-4ff8-901a-7cf38914deff/1781164857376_pii8q8zu.png',
        ID,
      ),
    ).toBe(
      '/api/oss/dev-file/uploads/b7b9a563-8803-4ff8-901a-7cf38914deff/1781164857376_pii8q8zu.png',
    );
  });

  it('encodes each segment of a bare key (no slash inside segments)', () => {
    // Segments with chars that need encoding (rare, but the
    // encoder must run on every segment — not on the slash).
    const input = 'uploads/user-1/photo with space.jpg';
    expect(rebaseUrl(input, ID)).toBe(
      '/api/oss/dev-file/uploads/user-1/photo%20with%20space.jpg',
    );
  });

  it('preserves the original extension on a file:// result (capitalization normalized)', () => {
    const input = `file:///abs/.oss-dev/gen/${ID}.JPG`;
    expect(rebaseUrl(input, ID)).toBe(`/api/oss/dev-file/gen/${ID}.jpg`);
  });
});
