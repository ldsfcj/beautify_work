import axios from 'axios';
import api from './index';

/**
 * Ask the server for a presigned PUT URL the browser uses to
 * upload directly to OSS. The key must be of the form
 * `uploads/{userId}/{file}.{ext}` — the server enforces it.
 *
 * Returns `{ url, key, expiresIn }` where `url` is:
 *   - real OSS: a presigned https URL on the bucket
 *   - dev mode: a relative `/api/oss/dev-upload/:key` path the
 *     Nest server fronts in place of OSS
 *
 * The browser never reads the response body; the interceptor
 * unwraps the `{ code, data }` envelope before we get here.
 */
export const getPresignedUploadUrl = (key, contentType, expiresIn = 300) =>
  api.put('/oss/presign', { key, contentType, expiresIn });

/**
 * PUT the file blob to the presigned URL.
 *
 * In production the presigned URL points to Aliyun OSS; we must
 * NOT send our Authorization header because the bucket signature
 * would reject it. So we build a fresh axios instance without
 * interceptors.
 *
 * In dev mode the presigned URL points back to our own
 * `/api/oss/dev-upload/:key` endpoint, which IS JWT-gated.
 * We detect this by checking whether the URL is relative (starts
 * with `/`) and use the authenticated `api` instance instead.
 *
 * `onUploadProgress` is the Vant uploader's progress callback
 * shape: `{ loaded, total }` in bytes.
 */
export const uploadFileToOss = (presignedUrl, file, contentType, onUploadProgress) => {
  const isDevProxy = presignedUrl.startsWith('/');

  if (isDevProxy) {
    // Dev mode: the URL hits our own server, needs the JWT token.
    // Use the wrapped `api` instance which carries Authorization.
    // Strip the `/api` prefix because `api` already has baseURL='/api'.
    // Wrap the file in FormData because the dev-upload endpoint uses
    // Multer's FileInterceptor('file'), which expects multipart/form-data
    // — unlike the production OSS presigned URL which accepts a raw PUT.
    const path = presignedUrl.replace(/^\/api/, '');
    const formData = new FormData();
    formData.append('file', file);
    return api.post(path, formData, {
      // Let the browser set Content-Type automatically so the
      // multipart boundary is included — do NOT set it manually.
      onUploadProgress: onUploadProgress
        ? (e) => onUploadProgress({ loaded: e.loaded, total: e.total })
        : undefined,
    });
  }

  // Production: the URL points to OSS — no Authorization header.
  const http = axios.create({ timeout: 120000 });
  return http.put(presignedUrl, file, {
    headers: { 'Content-Type': contentType },
    onUploadProgress: onUploadProgress
      ? (e) => onUploadProgress({ loaded: e.loaded, total: e.total })
      : undefined,
  });
};
