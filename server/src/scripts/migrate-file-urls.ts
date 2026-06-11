/**
 * One-off data migration: rebase legacy rows in the
 * `generations` table to the new `/api/oss/dev-file/…` URL shape
 * introduced when `OssService` was fixed to return server-
 * relative URLs the browser can actually load.
 *
 * Three legacy shapes can be sitting in the DB after rolling
 * forward from older code (or a worker that hadn't reloaded yet):
 *
 *   1. `file:///abs/path/...`      — early dev fallback
 *   2. `/api/oss/dev-file/file%3A///...`
 *                                   — an already-wrapped file://
 *                                     (re-wrap bug)
 *   3. `uploads/<userId>/<file>`   — bare OSS key (never wrapped)
 *
 * All three are normalized to the canonical
 * `/api/oss/dev-file/<encoded key>` shape, OR — for `result_url`
 * rows whose `file://` payload was a dev-mode generated image —
 * to `/api/oss/dev-file/gen/<id>.<ext>`.
 *
 * Idempotent: rows that already start with `/api/oss/dev-file/`
 * are left alone. Re-runs are safe.
 *
 * Run with:
 *   npm run migrate:dev-urls
 *   # or directly:
 *   npx ts-node --transpile-only -r tsconfig-paths/register \
 *     scripts/migrate-file-urls.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import { dataSourceOptions } from '../config/typeorm.config';

/**
 * Pure: given a stored value, return the canonical dev-file URL
 * or `null` if the value is already correct (or unrecoverable).
 * Extracted so the unit test in `migrate-file-urls.spec.ts` can
 * exercise all the shape variants without spinning up Postgres.
 */
export function rebaseUrl(stored: string | null | undefined, id: string): string | null {
  if (!stored) return null;

  // External URL (prod) — leave alone.
  if (/^https?:\/\//i.test(stored)) return null;

  // 1) Plain file:// — decode and turn into dev-file.
  //    For result_url rows the canonical target is
  //    `/api/oss/dev-file/gen/<id>.<ext>` (the worker writes the
  //    generated image there). We detect "looks like a result"
  //    by checking the path ends in `/gen/<id>.<ext>`.
  if (stored.startsWith('file://')) {
    return resultUrlFromFileUrl(stored, id);
  }

  // 2) URL-encoded file:// that someone wrapped twice.
  //    The shape is exactly `/api/oss/dev-file/file%3A%2F%2F...`.
  //    Must be checked BEFORE the "already canonical" check
  //    below — the prefix matches but the payload is bogus.
  if (stored.startsWith('/api/oss/dev-file/file%3A')) {
    const decoded = decodeURIComponent(stored.replace(/^\/api\/oss\/dev-file\//, ''));
    return resultUrlFromFileUrl(decoded, id);
  }

  // Already canonical — leave alone.
  if (stored.startsWith('/api/oss/dev-file/')) return null;

  // 3) Bare OSS key like `uploads/<userId>/<rest>`.
  const segs = stored.split('/').map(encodeURIComponent);
  return `/api/oss/dev-file/${segs.join('/')}`;
}

/**
 * Convert a `file:///abs/path/...` URL to the canonical
 * dev-file URL. For result rows, the source path is
 * `<…>/.oss-dev/gen/<id>.<ext>` and we normalize to
 * `/api/oss/dev-file/gen/<id>.<ext>`. For anything else
 * (defensive), fall back to encoding the whole path under
 * `/api/oss/dev-file/`.
 */
function resultUrlFromFileUrl(fileUrl: string, id: string): string {
  const path = fileUrl.replace(/^file:\/\//, '');
  // Worker writes the generated image at `<devDir>/gen/<id>.<ext>`.
  const genMatch = /\/gen\/[^/]+\.([a-z0-9]+)$/i.exec(path);
  if (genMatch) {
    return `/api/oss/dev-file/gen/${id}.${genMatch[1].toLowerCase()}`;
  }
  // Upload — `<devDir>/uploads/<userId>/<file>.<ext>`.
  const uploadMatch = /\/uploads\/(.+)$/i.exec(path);
  if (uploadMatch) {
    const segs = uploadMatch[1].split('/').map(encodeURIComponent);
    return `/api/oss/dev-file/uploads/${segs.join('/')}`;
  }
  // Last-resort fallback: wrap the absolute path. Almost never hit.
  return `/api/oss/dev-file/${path.split('/').map(encodeURIComponent).join('/')}`;
}

async function main() {
  const ds = new DataSource({
    ...dataSourceOptions,
    entities: [path.join(__dirname, '..', 'entities/*.entity.{ts,js}')],
    migrationsRun: false,
  });
  await ds.initialize();
  try {
    let resultFixed = 0;
    let originalFixed = 0;

    // Pull every row that might need work in one pass. The
    // rebaseUrl function decides per-row whether the value is
    // canonical or what to rewrite it to.
    const rows: Array<{ id: string; result_url: string | null; original_url: string }> =
      await ds.query(
        `SELECT id, result_url, original_url FROM generations
         WHERE result_url IS NOT NULL
            OR original_url NOT LIKE '/api/%'`,
      );

    for (const r of rows) {
      const newResult = r.result_url ? rebaseUrl(r.result_url, r.id) : null;
      if (newResult) {
        await ds.query('UPDATE generations SET result_url = $1 WHERE id = $2', [newResult, r.id]);
        console.log(`[fix] result_url  ${r.id}: ${r.result_url} → ${newResult}`);
        resultFixed++;
      }
      const newOriginal = rebaseUrl(r.original_url, r.id);
      if (newOriginal) {
        await ds.query('UPDATE generations SET original_url = $1 WHERE id = $2', [newOriginal, r.id]);
        console.log(`[fix] original_url ${r.id}: ${r.original_url} → ${newOriginal}`);
        originalFixed++;
      }
    }

    if (resultFixed === 0 && originalFixed === 0) {
      console.log('[fix] no rows needed migration — all URLs are already in the new shape.');
    } else {
      console.log(
        `[fix] migrated ${resultFixed} result_url + ${originalFixed} original_url rows.`,
      );
    }
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
