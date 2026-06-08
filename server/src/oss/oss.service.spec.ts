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

  it('uploads a buffer and returns a file:// URL', async () => {
    const buf = Buffer.from('hello world');
    const url = await service.upload('gen/abc.jpg', buf);
    expect(url.startsWith('file://')).toBe(true);
    const written = await fs.readFile(url.replace('file://', ''));
    expect(written.equals(buf)).toBe(true);
  });

  it('creates intermediate directories on demand', async () => {
    const buf = Buffer.from('x');
    const url = await service.upload('a/b/c/d.jpg', buf);
    const stat = await fs.stat(url.replace('file://', ''));
    expect(stat.isFile()).toBe(true);
  });

  it('returns a file:// URL from signedUrl in dev mode', async () => {
    const url = await service.signedUrl('gen/abc.jpg', 60);
    expect(url.startsWith('file://')).toBe(true);
  });

  it('different keys produce different URLs', async () => {
    const buf = Buffer.from('z');
    const u1 = await service.upload('k1', buf);
    const u2 = await service.upload('k2', buf);
    expect(u1).not.toBe(u2);
  });
});
