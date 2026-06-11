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
 * PUT the file blob to the presigned URL. We deliberately
 * build a fresh axios instance (not the wrapped `api`) because:
 *
 *   - the presigned URL is on a different host (real OSS) in
 *     production — our interceptors would add an Authorization
 *     header that the bucket signature would reject
 *   - we want to surface upload progress to the caller without
 *     the response envelope shim interfering
 *
 * `onUploadProgress` is the Vant uploader's progress callback
 * shape: `{ loaded, total }` in bytes.
 */
export const uploadFileToOss = (presignedUrl, file, contentType, onUploadProgress) => {
  const http = axios.create({ timeout: 120000 });
  return http.put(presignedUrl, file, {
    headers: { 'Content-Type': contentType },
    onUploadProgress: onUploadProgress
      ? (e) => onUploadProgress({ loaded: e.loaded, total: e.total })
      : undefined,
  });
};
