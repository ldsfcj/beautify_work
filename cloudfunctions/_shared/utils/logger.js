// 结构化日志：所有输出 JSON 单行，方便云开发日志检索 + 后端聚合
// 字段固定 level/msg/ts；调用方可传 meta 注入 requestId/uid 等上下文
function info(msg, meta) {
  console.log(JSON.stringify({ level: 'info', msg, ...meta, ts: Date.now() }));
}
function error(msg, meta) {
  console.error(JSON.stringify({ level: 'error', msg, ...meta, ts: Date.now() }));
}
function warn(msg, meta) {
  console.warn(JSON.stringify({ level: 'warn', msg, ...meta, ts: Date.now() }));
}
module.exports = { info, error, warn };
