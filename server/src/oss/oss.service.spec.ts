import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { OssService } from './oss.service';

/**
 * OssService tests run against the dev fallback only — we
 * never hit real Aliyun OSS in unit tests. The ConfigService
 * is stubbed with no AK/SK so the constructor picks the local
 * path; each test gets a fresh tmpdir so writes don't collide.
 */
describe('OssService (dev fallback)', () => {
  let tmpRoot: string;
  let service: OssService;
  let cfg: { get: jest.Mock };

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'oss-test-'));
    cfg = { get: jest.fn() } as any;
    cfg.get.mockImplementation((k: string) => {
      const map: Record<string, string> = {
        'oss.accessKeyId': '',
        'oss.accessKeySecret': '',
        'oss.bucket': 'beautify-test',
        'oss.endpoint': '',
      };
      return map[k];
    });
    // The service resolves devDir from cwd; point cwd at tmpRoot
    // for the test so files land in our isolated directory.
    const origCwd = process.cwd();
    process.chdir(tmpRoot);
    service = new OssService(cfg as unknown as ConfigService);
    (service as any).devDir = path.join(tmpRoot, '.oss-dev');
    process.chdir(origCwd);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('uploads a buffer and returns a server-relative dev-file URL', async () => {
    const buf = Buffer.from('hello world');
    const url = await service.upload('gen/abc.jpg', buf);
    expect(url).toBe('/api/oss/dev-file/gen/abc.jpg');
    const written = await fs.readFile(path.join(tmpRoot, '.oss-dev', 'gen', 'abc.jpg'));
    expect(written.equals(buf)).toBe(true);
  });

  it('creates intermediate directories on demand', async () => {
    const buf = Buffer.from('x');
    await service.upload('a/b/c/d.jpg', buf);
    const stat = await fs.stat(path.join(tmpRoot, '.oss-dev', 'a', 'b', 'c', 'd.jpg'));
    expect(stat.isFile()).toBe(true);
  });

  it('signedUrl in dev mode returns a server-relative dev-file URL', async () => {
    const url = await service.signedUrl('gen/abc.jpg', 60);
    expect(url).toBe('/api/oss/dev-file/gen/abc.jpg');
  });

  it('different keys produce different URLs', async () => {
    const buf = Buffer.from('z');
    const u1 = await service.upload('k1', buf);
    const u2 = await service.upload('k2', buf);
    expect(u1).not.toBe(u2);
  });

  it('getUploadSignature in dev mode returns the local dev-upload URL', async () => {
    const { url, key, expiresIn } = await service.getUploadSignature(
      'uploads/user-1/abc.jpg',
      'image/jpeg',
      300,
    );
    expect(key).toBe('uploads/user-1/abc.jpg');
    expect(expiresIn).toBe(300);
    expect(url).toBe('/api/oss/dev-upload/uploads%2Fuser-1%2Fabc.jpg');
  });

  it('exists returns true after a successful upload', async () => {
    await service.upload('uploads/user-1/abc.jpg', Buffer.from('img'));
    expect(await service.exists('uploads/user-1/abc.jpg')).toBe(true);
  });

  it('exists returns false for a key that was never written', async () => {
    expect(await service.exists('uploads/user-1/missing.jpg')).toBe(false);
  });

  // The dev fallback must return a URL the browser can actually
  // load. The previous `file://` URLs were a real load-bearing
  // bug: a `<img src="file:///...">` from a `http://localhost`
  // page is blocked by the browser's same-origin policy and
  // renders as a broken image (or a black box under Vant). The
  // fix routes dev reads through `GET /api/oss/dev-file/:key`
  // so the server itself serves the bytes — same shape as the
  // production signed-URL flow, just local.
  it('dev signedUrl returns a server-relative URL the browser can fetch', async () => {
    const url = await service.signedUrl('gen/abc.jpg', 60);
    expect(url.startsWith('http')).toBe(false);
    expect(url.startsWith('file://')).toBe(false);
    expect(url).toBe('/api/oss/dev-file/gen/abc.jpg');
  });

  it('dev upload returns a server-relative URL the browser can fetch', async () => {
    const buf = Buffer.from('hello world');
    const url = await service.upload('gen/abc.jpg', buf);
    expect(url.startsWith('file://')).toBe(false);
    expect(url).toBe('/api/oss/dev-file/gen/abc.jpg');
    // The upload must still write the bytes to disk so the
    // dev-file endpoint has something to serve.
    const written = await fs.readFile(path.join(tmpRoot, '.oss-dev', 'gen', 'abc.jpg'));
    expect(written.equals(buf)).toBe(true);
  });

  it('signedUrl is idempotent when the input is already a dev-file URL', async () => {
    // Real call site: downloadUrl endpoint reads
    // g.resultUrl from the DB and hands it to signedUrl.
    // The DB stores whatever upload() returned, which is
    // the dev-file URL — passing that through signedUrl
    // must not double-wrap it.
    const uploaded = await service.upload('gen/abc.jpg', Buffer.from('x'));
    const reSigned = await service.signedUrl(uploaded, 60);
    expect(reSigned).toBe(uploaded);
  });
});
