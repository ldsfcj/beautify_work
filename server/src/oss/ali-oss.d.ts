declare module 'ali-oss' {
  /**
   * Minimal type shim for the parts of ali-oss the OssService
   * actually uses. The real package ships JS-only; this stub
   * is intentionally narrow so adding new methods is a
   * conscious decision (and a typecheck signal) rather than
   * `any` by default.
   */
  interface OssOptions {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint?: string;
    secure?: boolean;
  }

  interface PutResult {
    url: string;
    name: string;
    res: { status: number; headers: Record<string, string> };
  }

  interface PutOptions {
    headers?: Record<string, string>;
  }

  interface SignatureUrlOptions {
    expires?: number;
    method?: 'GET' | 'PUT' | 'POST' | 'DELETE';
    [subResource: string]: unknown;
  }

  export default class OSS {
    constructor(options: OssOptions);
    put(key: string, body: Buffer | string, options?: PutOptions): Promise<PutResult>;
    signatureUrl(key: string, options?: SignatureUrlOptions): Promise<string>;
    /** HEAD on an object — 404 if the key doesn't exist. */
    head(key: string): Promise<{ status: number; headers: Record<string, string> }>;
  }
}
