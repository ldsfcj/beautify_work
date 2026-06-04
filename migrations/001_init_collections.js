module.exports.up = async (db) => {
  const collections = [
    'users', 'credit_packages', 'orders', 'generations',
    'preset_items', 'credit_ledger', 'system_configs',
    'ai_call_logs', 'download_logs', 'rate_limit_buckets',
    'refunds', 'admin_users', 'user_agreements', '_migrations',
  ];
  for (const name of collections) {
    try { await db.createCollection(name); } catch (e) {
      if (!String(e.message).includes('already')) throw e;
    }
  }
};
