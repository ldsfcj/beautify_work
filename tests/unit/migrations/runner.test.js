const runner = require('../../../migrations/runner');

describe('migration runner', () => {
  test('lists migrations in order', async () => {
    const list = await runner.list();
    // 001_init_collections is the only fully-defined migration in Task 4;
    // 002/003 are Task 5 placeholders (matched by the same regex).
    expect(list).toContain('001_init_collections.js');
    // Verify the list is sorted (migrations run in lexicographic order)
    expect(list).toEqual([...list].sort());
  });
});
