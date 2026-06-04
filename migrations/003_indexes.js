// migrations/003_indexes.js
// 给 14 个集合的关键字段加索引（含 2 个 TTL）

module.exports.up = async (db) => {
  // users
  await db.collection('users').createIndex({ openid: 1 }, { unique: true });
  await db.collection('users').createIndex({ status: 1 });
  await db.collection('users').createIndex({ created_at: -1 });

  // orders
  await db.collection('orders').createIndex({ order_no: 1 }, { unique: true });
  await db.collection('orders').createIndex({ user_id: 1, created_at: -1 });
  await db.collection('orders').createIndex({ status: 1 });

  // generations（含 TTL：图片 30 天过期）
  await db.collection('generations').createIndex({ user_id: 1, created_at: -1 });
  await db.collection('generations').createIndex({ status: 1 });
  await db.collection('generations').createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 }
  );

  // preset_items
  await db.collection('preset_items').createIndex({ is_active: 1, sort_order: 1 });
  await db.collection('preset_items').createIndex({ key: 1 }, { unique: true });

  // rate_limit_buckets（TTL 1 分钟，无活动 token 自动回收）
  await db.collection('rate_limit_buckets').createIndex(
    { updated_at: 1 },
    { expireAfterSeconds: 60 }
  );

  // credit_ledger
  await db.collection('credit_ledger').createIndex({ user_id: 1, created_at: -1 });

  // ai_call_logs
  await db.collection('ai_call_logs').createIndex({ user_id: 1, created_at: -1 });
  await db.collection('ai_call_logs').createIndex({ generation_id: 1 });
};
