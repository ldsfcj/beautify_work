import 'dotenv/config';
import dataSource from './typeorm.config';

/**
 * TDD smoke: the DataSource must be constructable and (against a real
 * PostgreSQL) initialize with all 15 entities + 5 migrations registered.
 * Requires docker compose postgres service to be up.
 *
 * Update the counts whenever a new entity or migration lands — this
 * spec catches silent drift between `typeorm.config.ts` and the actual
 * `entities/` + `migrations/` directories.
 */
describe('DataSource config', () => {
  it('initializes with 15 entities and 5 migrations', async () => {
    await expect(dataSource.initialize()).resolves.toBeDefined();
    const metadatas = dataSource.entityMetadatas;
    const migrations = dataSource.migrations;
    expect(metadatas).toHaveLength(15);
    expect(migrations).toHaveLength(5);
    await dataSource.destroy();
  }, 30000);
});
