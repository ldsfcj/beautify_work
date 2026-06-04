const fs = require('fs').promises;
const path = require('path');

const STATE_COLL = '_migrations';

async function list() {
  const files = await fs.readdir(__dirname);
  return files.filter(f => /^\d+_.*\.js$/.test(f)).sort();
}

async function run(db) {
  const migrations = await list();
  const state = await db.collection(STATE_COLL).get();
  const applied = new Set(state.data.map(s => s.name));
  for (const name of migrations) {
    if (applied.has(name)) continue;
    const m = require(path.join(__dirname, name));
    if (typeof m.up !== 'function') {
      throw new Error(`Migration ${name} missing up()`);
    }
    await m.up(db);
    await db.collection(STATE_COLL).add({ name, applied_at: new Date() });
    console.log(`[migration] applied ${name}`);
  }
}

module.exports = { list, run };
