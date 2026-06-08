import 'dotenv/config';
import dataSource from './typeorm.config';

/**
 * TDD smoke: the DataSource must be constructable and (against a real
 * PostgreSQL) initialize with all 14 entities and 2 migrations registered.
 * Requires docker compose postgres service to be up.
 */
describe('DataSource config', () => {
  it('initializes with 14 entities and 3 migrations', async () => {
    await expect(dataSource.initialize()).resolves.toBeDefined();
    const metadatas = dataSource.entityMetadatas;
    const migrations = dataSource.migrations;
    expect(metadatas).toHaveLength(14);
    expect(migrations).toHaveLength(3);
    await dataSource.destroy();
  }, 30000);
});
