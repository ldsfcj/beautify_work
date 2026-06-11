/**
 * One-off data migration: rebase legacy file:// rows to the new
 * /api/oss/dev-file/ URL shape introduced when OssService was
 * fixed to return server-relative URLs the browser can load.
 *
 * Idempotent: rows that already point at /api/oss/dev-file/ are
 * left alone. Run with:
 *   npx ts-node --transpile-only -r tsconfig-paths/register \
 *     scripts/migrate-file-urls.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';
import { dataSourceOptions } from '../src/config/typeorm.config';

async function main() {
  const ds = new DataSource({
    ...dataSourceOptions,
    entities: [path.join(__dirname, '..', 'src/entities/*.entity.{ts,js}')],
    migrationsRun: false,
  });
  await ds.initialize();
  try {
    // 1. Migrate file:// result_url rows to /api/oss/dev-file/gen/<id>.jpg
    const fileRows: Array<{ id: string; result_url: string }> = await ds.query(
      "SELECT id, result_url FROM generations WHERE result_url LIKE 'file://%'",
    );
    for (const r of fileRows) {
      const newUrl = `/api/oss/dev-file/gen/${r.id}.jpg`;
      await ds.query('UPDATE generations SET result_url = $1 WHERE id = $2', [newUrl, r.id]);
      console.log(`[fix] result_url  ${r.id}: file://... → ${newUrl}`);
    }

    // 2. Migrate original_url rows that aren't already dev-file URLs
    //    (we don't know the file extension — read the row to find it).
    const rawOriginal: Array<{ id: string; original_url: string }> = await ds.query(
      "SELECT id, original_url FROM generations WHERE original_url NOT LIKE '/api/%' AND original_url NOT LIKE 'http%'",
    );
    for (const r of rawOriginal) {
      // original_url is `uploads/<userId>/<rest>`; the read path
      // will wrap it through OssService.signedUrl() automatically,
      // but for legacy rows we want the data to be self-contained
      // so even direct DB inspection shows the correct shape.
      const segs = r.original_url.split('/').map(encodeURIComponent);
      const newUrl = `/api/oss/dev-file/${segs.join('/')}`;
      await ds.query('UPDATE generations SET original_url = $1 WHERE id = $2', [newUrl, r.id]);
      console.log(`[fix] original_url ${r.id}: ${r.original_url} → ${newUrl}`);
    }

    if (fileRows.length === 0 && rawOriginal.length === 0) {
      console.log('[fix] no rows needed migration — all URLs are already in the new shape.');
    } else {
      console.log(
        `[fix] migrated ${fileRows.length} result_url + ${rawOriginal.length} original_url rows.`,
      );
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
