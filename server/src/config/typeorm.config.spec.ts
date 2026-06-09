import 'dotenv/config';
import dataSource from './typeorm.config';

/**
 * TDD smoke: the DataSource must be constructable and (against a real
 * PostgreSQL) initialize with all 14 entities + 4 migrations registered.
 * Requires docker compose postgres service to be up.
 *
 * Update the counts whenever a new entity or migration lands — this
 * spec catches silent drift between `typeorm.config.ts` and the actual
 * `entities/` + `migrations/` directories.
 */
describe('DataSource config', () => {
  it('initializes with 14 entities and 4 migrations', async () => {
    await expect(dataSource.initialize()).resolves.toBeDefined();
    const metadatas = dataSource.entityMetadatas;
    const migrations = dataSource.migrations;
    expect(metadatas).toHaveLength(14);
    expect(migrations).toHaveLength(4);
    await dataSource.destroy();
  }, 30000);
});
