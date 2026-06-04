const { run } = require('../../../migrations/runner');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  await run(cloud.database());
  return { ok: true };
};
