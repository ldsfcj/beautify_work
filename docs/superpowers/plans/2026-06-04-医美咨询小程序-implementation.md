# 医美咨询 AI 预览小程序 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 12 周内交付一个医美咨询师专用的微信小程序，支持上传客户照片、选预设项目、AI 生成整形预览图，按次积分计费，含合规、运营后台、监控告警。

**Architecture:** 微信云开发（云函数 + 云数据库 + 云存储）+ 微信小程序原生 + H5 运营后台。AI 调用为异步流程（云数据库 stream 触发 worker），通过微信订阅消息通知用户。零域名备案，所有可变内容存数据库。

**Tech Stack:**
- 后端：Node.js 18+（云函数）
- 前端：微信小程序原生（WXML + WXSS + JS）+ WeChat UX
- 运营后台：Vue 3 + Vite + Element Plus（H5，部署在云开发静态托管）
- 数据库：云开发 MongoDB-like
- AI：阿里通义万相（主）+ 腾讯混元（备）
- 支付：微信支付 JSAPI v3
- 测试：Jest（单元/集成）+ miniprogram-automator（E2E）
- CI/CD：miniprogram-ci + GitHub Actions
- 监控：云开发自带 + 微信群机器人 webhook

---

## 0. 阶段概览

| 阶段 | 周 | 交付 | 可独立运行？ |
|---|---|---|---|
| **P1 基础** | W1-W2 | 项目脚手架、CI/CD、12 张表、3 个环境 | 数据库可查，无业务功能 |
| **P2 账号+积分+支付** | W3-W4 | 登录、套餐、订单、支付回调、流水账 | 可登录买积分（无 AI） |
| **P3 AI 集成** | W5-W6 | AIService、异步 worker、限流、退款流 | 后台可发 AI（无前端） |
| **P4 咨询师端页面** | W7-W8 | 10 个小程序页面 | **可对外发布** |
| **P5 后台+合规+上线** | W9-W12 | 运营后台、cron、e2e、备案、灰度 | 完整 v1 上线 |

> 每个阶段结束时做 code review + 用户验收 + commit 里程碑 tag。阶段之间可暂停重新规划。

---

## 1. 目标文件结构

```
/home/ubuntu/personal_work/
├── miniprogram/                  # 微信小程序（前端）
│   ├── app.{js,json,wxss}
│   ├── project.config.json
│   ├── sitemap.json
│   ├── pages/                    # 10 个页面
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── generate/
│   │   ├── generating/
│   │   ├── result/
│   │   ├── history/
│   │   ├── recharge/
│   │   ├── profile/
│   │   ├── order-detail/
│   │   └── agreement/
│   ├── components/               # 共享组件
│   │   ├── image-uploader/
│   │   ├── preset-chip/
│   │   ├── credit-card/
│   │   └── loading-mask/
│   ├── utils/                    # 工具函数
│   │   ├── api.js                # 封装 wx.cloud.callFunction
│   │   ├── auth.js               # 登录态管理
│   │   ├── format.js             # 时间/金额格式化
│   │   └── subscribe.js          # 订阅消息封装
│   └── images/                   # 静态资源
│
├── cloudfunctions/               # 云函数（后端）
│   ├── _shared/                  # 跨函数复用模块（不在云开发中部署为独立函数）
│   │   ├── services/
│   │   │   ├── aiservice/        # AI 调用封装
│   │   │   ├── ratelimiter/      # 令牌桶
│   │   │   ├── creditledger/     # 积分事务
│   │   │   ├── auditlog/         # 审计日志
│   │   │   ├── imageaudit/       # 图片审核
│   │   │   ├── wechatpay/        # 微信支付封装
│   │   │   ├── imagestorage/     # 云存储
│   │   │   └── subscribemsg/     # 订阅消息
│   │   ├── utils/
│   │   │   ├── response.js       # 统一响应格式
│   │   │   ├── validator.js      # 入参白名单
│   │   │   ├── jwt.js            # token 签发
│   │   │   ├── crypto.js         # 字段加密
│   │   │   └── logger.js         # 结构化日志
│   │   └── middlewares/
│   │       ├── auth.js           # 小程序 openid 鉴权
│   │       ├── adminAuth.js      # 后台 JWT 鉴权
│   │       └── errorHandler.js   # 统一错误处理
│   ├── user/                     # 4 个云函数
│   │   ├── login/
│   │   ├── profile/
│   │   ├── updateProfile/
│   │   └── cancel/
│   ├── credit/packages/
│   ├── order/{create,list,detail}/
│   ├── pay/callback/
│   ├── agreement/{current,accept}/
│   ├── preset/list/
│   ├── generate/                 # 7 个云函数
│   │   ├── submit/
│   │   ├── worker/               # DB stream 触发
│   │   ├── status/
│   │   ├── list/
│   │   ├── detail/
│   │   ├── delete/
│   │   └── downloadUrl/
│   ├── admin/                    # 9 个云函数
│   │   ├── login/
│   │   ├── dashboard/
│   │   ├── orders/
│   │   ├── users/
│   │   ├── presets/
│   │   ├── packages/
│   │   ├── configs/
│   │   ├── aiLogs/
│   │   └── auditLog/
│   └── cron/
│       ├── expireGenerations/
│       ├── dailyReconcile/
│       └── cleanupOrphanFiles/
│
├── admin/                        # 运营后台 H5
│   ├── index.html
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.js
│   │   ├── router.js
│   │   ├── api/                  # 调用 admin 云函数
│   │   ├── stores/               # pinia
│   │   ├── pages/
│   │   │   ├── Login.vue
│   │   │   ├── Dashboard.vue
│   │   │   ├── Orders.vue
│   │   │   ├── Users.vue
│   │   │   ├── Presets.vue
│   │   │   ├── Packages.vue
│   │   │   ├── Configs.vue
│   │   │   ├── AILogs.vue
│   │   │   └── AuditLog.vue
│   │   └── components/
│   └── package.json
│
├── tests/
│   ├── unit/                     # 单元测试
│   ├── integration/              # 云函数集成测试
│   └── e2e/                      # miniprogram-automator
│
├── migrations/                   # 数据库 schema 迁移
│   ├── 001_init_collections.js
│   ├── 002_seed_data.js
│   └── runner.js
│
├── scripts/
│   ├── deploy-staging.sh
│   ├── deploy-prod.sh
│   └── check-migrations.js
│
├── .github/workflows/
│   ├── ci.yml                    # 单元/集成测试
│   └── deploy-staging.yml        # main 分支自动部署 staging
│
├── package.json                  # monorepo 根
├── .gitignore
└── README.md
```

---

## 2. 阶段 1（P1）：基础（W1-W2）

### Task 1: 初始化项目仓库

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`, `miniprogram/app.json`, `miniprogram/project.config.json`

- [ ] **Step 1: 初始化 git 仓库**

```bash
cd /home/ubuntu/personal_work
git init
git config user.name "陈工"
git config user.email "cheng@example.com"
```

- [ ] **Step 2: 创建 .gitignore**

```gitignore
node_modules/
.miniprogram/
.DS_Store
*.log
.superpowers/
coverage/
dist/
.env
.env.local
cloudfunctions/*/node_modules/
```

- [ ] **Step 3: 创建根 package.json**

```json
{
  "name": "medical-aesthetics-miniapp",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["cloudfunctions/_shared", "admin"],
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration --runInBand",
    "lint": "eslint ."
  },
  "devDependencies": {
    "jest": "^29.0.0",
    "eslint": "^8.0.0"
  }
}
```

- [ ] **Step 4: 创建小程序 app.json**

```json
{
  "pages": [
    "pages/login/index",
    "pages/dashboard/index",
    "pages/generate/index",
    "pages/generating/index",
    "pages/result/index",
    "pages/history/index",
    "pages/recharge/index",
    "pages/profile/index",
    "pages/order-detail/index",
    "pages/agreement/index"
  ],
  "window": {
    "navigationBarBackgroundColor": "#d4a5a0",
    "navigationBarTextStyle": "white",
    "navigationBarTitleText": "AI 美颜预览"
  },
  "cloud": true,
  "sitemapLocation": "sitemap.json"
}
```

- [ ] **Step 5: 创建 project.config.json**

```json
{
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "setting": {
    "urlCheck": false,
    "es6": true,
    "enhance": true
  },
  "compileType": "miniprogram",
  "appid": "替换为您的 AppID"
}
```

- [ ] **Step 6: 创建 README.md**

```markdown
# 医美咨询 AI 预览小程序

微信小程序，给医美咨询师上传客户照片 + 选预设项目 + AI 生成整形预览。

## 开发

```bash
# 安装依赖
npm install

# 测试
npm test

# 部署到云开发
npx miniprogram-ci upload --pp ./miniprogram/project.config.json --pkp ./private.key
```

详见 [设计文档](../specs/2026-06-04-医美咨询小程序-design.md)。
```

- [ ] **Step 7: 首次提交**

```bash
git add .
git commit -m "chore: 初始化项目结构"
```

---

### Task 2: 配置 3 个云开发环境

**Files:** 不需新增代码，仅在云开发控制台操作

- [ ] **Step 1: 在微信云开发控制台创建 3 个环境**

| 环境 | 名称 | 用途 |
|---|---|---|
| 开发 | `mae-dev-xxxx`（系统随机后缀）| 本地调试 |
| 预发 | `mae-staging-xxxx` | 内部测试 |
| 生产 | `mae-prod-xxxx` | 正式发布 |

- [ ] **Step 2: 在 `miniprogram/app.js` 写环境切换**

```javascript
// miniprogram/app.js
App({
  onLaunch() {
    // 编译时通过 wx.env 注入环境变量，运行时切换
    const envMap = {
      develop: 'mae-dev-xxxx',
      trial: 'mae-staging-xxxx',
      release: 'mae-prod-xxxx',
    };
    const env = envMap[__wxConfig.envVersion] || envMap.develop;
    wx.cloud.init({ env, traceUser: true });
  },
});
```

- [ ] **Step 3: 提交**

```bash
git add miniprogram/app.js
git commit -m "feat(miniprogram): 初始化云开发环境切换"
```

---

### Task 3: 配置 CI/CD（GitHub Actions）

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/deploy-staging.yml`

- [ ] **Step 1: 创建 CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test:unit
```

- [ ] **Step 2: 创建 staging 自动部署**

```yaml
# .github/workflows/deploy-staging.yml
name: Deploy Staging
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      # 调用 miniprogram-ci 上传代码
      - run: npx miniprogram-ci upload \
          --pp ./miniprogram/project.config.json \
          --pkp ${{ secrets.MINI_PROGRAM_PRIVATE_KEY_PATH }} \
          --appid ${{ secrets.MINI_PROGRAM_APPID }} \
          --uv ${{ github.sha }}
        env:
          CI: true
```

- [ ] **Step 3: 在 GitHub 仓库配置 secrets**

```
MINI_PROGRAM_PRIVATE_KEY_PATH : 微信代码上传密钥
MINI_PROGRAM_APPID : 您的 AppID
```

> 如非 GitHub，替换为对应平台的 CI 即可。

- [ ] **Step 4: 提交**

```bash
git add .github/
git commit -m "ci: 配置 GitHub Actions"
```

---

### Task 4: 数据库迁移框架

**Files:**
- Create: `migrations/runner.js`, `migrations/001_init_collections.js`, `cloudfunctions/_shared/utils/migration.js`

- [ ] **Step 1: 写失败的 runner 测试**

```javascript
// tests/unit/migrations/runner.test.js
const runner = require('../../../migrations/runner');

describe('migration runner', () => {
  test('lists migrations in order', async () => {
    const list = await runner.list();
    expect(list).toEqual(['001_init_collections']);
  });
  test('runs each migration exactly once', async () => {
    // mock DB；此处只断言：被调用的 up 函数都执行
  });
});
```

- [ ] **Step 2: 实现 runner**

```javascript
// migrations/runner.js
const fs = require('fs').promises;
const path = require('path');

const STATE_COLL = '_migrations';

async function list() {
  const dir = __dirname;
  const files = await fs.readdir(dir);
  return files
    .filter(f => /^\d+_.*\.js$/.test(f))
    .sort();
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
    await db.collection(STATE_COLL).add({
      name, applied_at: new Date(),
    });
    console.log(`[migration] applied ${name}`);
  }
}

module.exports = { list, run };
```

- [ ] **Step 3: 写第一个迁移（创建集合）**

```javascript
// migrations/001_init_collections.js
// 跑法：在 dev 环境的任意云函数入口调用 runner.run(db)
// 这里用云开发 mongo client 风格描述；具体通过云函数调用

module.exports.up = async (db) => {
  const collections = [
    'users', 'credit_packages', 'orders', 'generations',
    'preset_items', 'credit_ledger', 'system_configs',
    'ai_call_logs', 'download_logs', 'rate_limit_buckets',
    'refunds', 'admin_users', 'user_agreements', '_migrations',
  ];
  for (const name of collections) {
    try { await db.createCollection(name); } catch (e) {
      // 已存在则忽略
      if (!String(e.message).includes('already')) throw e;
    }
  }
};
```

- [ ] **Step 4: 实现 cloud function 入口（admin._initDb）**

```javascript
// cloudfunctions/admin/_initDb/index.js
const { run } = require('../../../migrations/runner');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  await run(cloud.database());
  return { ok: true };
};
```

- [ ] **Step 5: 在 dev 环境手动跑一次**

```bash
# 在云开发控制台 → 云函数 → 找到 admin/_initDb → 测试
# 或本地：
npx tcb fn run admin/_initDb -e mae-dev-xxxx
```

- [ ] **Step 6: 提交**

```bash
git add migrations/ cloudfunctions/admin/_initDb/
git commit -m "feat(db): 迁移框架 + 创建 14 个集合"
```

---

### Task 5: 数据库索引 + 默认配置种子数据

**Files:**
- Create: `migrations/002_seed_data.js`, `migrations/003_indexes.js`

- [ ] **Step 1: 写索引迁移**

```javascript
// migrations/003_indexes.js
// 跑完后立即执行（无副作用）

module.exports.up = async (db) => {
  // users
  await db.collection('users').createIndex({ openid: 1 }, { unique: true });
  await db.collection('users').createIndex({ status: 1 });
  await db.collection('users').createIndex({ created_at: -1 });

  // orders
  await db.collection('orders').createIndex({ order_no: 1 }, { unique: true });
  await db.collection('orders').createIndex({ user_id: 1, created_at: -1 });
  await db.collection('orders').createIndex({ status: 1 });

  // generations
  await db.collection('generations').createIndex({ user_id: 1, created_at: -1 });
  await db.collection('generations').createIndex({ status: 1 });
  await db.collection('generations').createIndex(
    { expires_at: 1 },
    { expireAfterSeconds: 0 }  // TTL
  );

  // preset_items
  await db.collection('preset_items').createIndex(
    { is_active: 1, sort_order: 1 }
  );
  await db.collection('preset_items').createIndex({ key: 1 }, { unique: true });

  // rate_limit_buckets
  await db.collection('rate_limit_buckets').createIndex(
    { updated_at: 1 },
    { expireAfterSeconds: 60 }  // TTL 1 min
  );

  // credit_ledger
  await db.collection('credit_ledger').createIndex({ user_id: 1, created_at: -1 });

  // ai_call_logs
  await db.collection('ai_call_logs').createIndex({ user_id: 1, created_at: -1 });
  await db.collection('ai_call_logs').createIndex({ generation_id: 1 });
};
```

- [ ] **Step 2: 写种子数据迁移**

```javascript
// migrations/002_seed_data.js
// 必须在 003_indexes 之前跑（preset_items 有 unique 索引）

const presetItems = [
  // 鼻部
  { key: 'nose_bridge_lift', category: '鼻部', name: '鼻梁增高',
    description: '提升鼻梁高度，更立体', default_prompt:
      'subtly raise and define the nose bridge, natural-looking, preserve ethnicity and facial identity, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 10 },
  { key: 'nose_tip_refine', category: '鼻部', name: '鼻尖塑形',
    description: '鼻尖精致微调', default_prompt:
      'refine and lift the nose tip, natural projection, preserve identity, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 20 },
  { key: 'nostril_reduce', category: '鼻部', name: '鼻翼缩小',
    description: '鼻翼更精致', default_prompt:
      'slightly reduce nostril width, balanced with face, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 30 },
  { key: 'hump_nose_fix', category: '鼻部', name: '鹰钩鼻/驼峰鼻矫正',
    description: '矫正鼻梁不平', default_prompt:
      'smooth the nasal hump, straighten the bridge, natural result, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 40 },
  // 眼部（4）
  { key: 'double_eyelid', category: '眼部', name: '双眼皮成形',
    description: '自然双眼皮', default_prompt:
      'add a natural double eyelid crease, asian-friendly option, subtle, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 50 },
  { key: 'eye_corner_open', category: '眼部', name: '开眼角',
    description: '眼型更开阔', default_prompt:
      'slightly extend the inner/outer canthus, brighter eye shape, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 60 },
  { key: 'eye_bag_remove', category: '眼部', name: '去眼袋',
    description: '去除眼袋黑眼圈', default_prompt:
      'remove under-eye bags and dark circles, smooth skin, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 70 },
  { key: 'brow_lift', category: '眼部', name: '提眉',
    description: '眉毛微提升', default_prompt:
      'subtly lift the eyebrows, more open eye area, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 80 },
  // 面部轮廓（4）
  { key: 'face_slim', category: '面部轮廓', name: '瘦脸',
    description: 'V 脸效果', default_prompt:
      'slightly slim the face contour, V-line effect, natural, preserve identity, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 90 },
  { key: 'cheekbone_reduce', category: '面部轮廓', name: '颧骨内推',
    description: '颧骨更柔和', default_prompt:
      'soften prominent cheekbones, smoother face contour, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 100 },
  { key: 'temple_fill', category: '面部轮廓', name: '太阳穴填充',
    description: '太阳穴更饱满', default_prompt:
      'fill in temple hollows, smoother forehead-to-cheek transition, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 110 },
  { key: 'cheek_fill', category: '面部轮廓', name: '苹果肌填充',
    description: '苹果肌更饱满', default_prompt:
      'subtly restore apple cheek volume, youthful look, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 120 },
  // 下颌（4）
  { key: 'chin_extend', category: '下颌', name: '垫下巴',
    description: '下巴更立体', default_prompt:
      'subtly extend the chin forward, better facial proportions, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 130 },
  { key: 'chin_reduce', category: '下颌', name: '缩下巴',
    description: '下巴更小巧', default_prompt:
      'slightly reduce chin length/projection, balanced profile, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 140 },
  { key: 'jaw_slim', category: '下颌', name: '瘦下颌角',
    description: '下颌角更柔和', default_prompt:
      'slim the mandibular angle, more oval face shape, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 150 },
  { key: 'double_chin_fix', category: '下颌', name: '双下巴消除',
    description: '下颌线更清晰', default_prompt:
      'reduce submental fat, defined jawline, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 160 },
  // 肤质（4）
  { key: 'skin_lifting', category: '肤质', name: '紧致提拉',
    description: '面部更紧致', default_prompt:
      'subtle non-surgical face lifting effect, firmer skin, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 170 },
  { key: 'nasolabial_fold', category: '肤质', name: '法令纹改善',
    description: '法令纹更浅', default_prompt:
      'soften nasolabial folds, smoother mid-face, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 180 },
  { key: 'skin_whitening', category: '肤质', name: '美白提亮',
    description: '肤色更均匀', default_prompt:
      'brighter, even skin tone, preserve ethnicity, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 190 },
  { key: 'pore_refine', category: '肤质', name: '毛孔细化',
    description: '皮肤更细腻', default_prompt:
      'refine pores, smoother skin texture, natural, realistic photograph',
    credits_cost: 2, is_active: true, sort_order: 200 },
];

const creditPackages = [
  { name: '尝鲜', credits: 50, price_cents: 2900, bonus_credits: 0, validity_days: 730, is_active: true, sort_order: 10 },
  { name: '标准', credits: 200, price_cents: 9900, bonus_credits: 20, validity_days: 730, is_active: true, sort_order: 20 },
  { name: '专业', credits: 500, price_cents: 22900, bonus_credits: 80, validity_days: 730, is_active: true, sort_order: 30 },
  { name: '机构', credits: 2000, price_cents: 89900, bonus_credits: 400, validity_days: 730, is_active: true, sort_order: 40 },
];

const systemConfigs = {
  ai_models: {
    primary: { vendor: 'tongyi', model: 'wanx-v1', enabled: true },
    secondary: { vendor: 'hunyuan', model: 'hunyuan-image', enabled: true },
    allow_fallback: true,
  },
  rate_limit: { per_minute: 5, per_day: 50, burst: 3 },
  credit_pricing_table: [
    { items: 1, cost: 2 },
    { items: 2, cost: 3 },
    { items: 3, cost: 4 },
    { items: 4, cost: 5 },
  ],
  ai_prompt_prefix: 'medical aesthetic reference photo, frontal view, high detail, ',
  ai_prompt_suffix: ', preserve ethnicity and facial identity, natural result, no text overlay, realistic photograph',
  image_retention_days: 30,
  protocols: {
    user: { version: 'v1.0', content: '...（v1 启动前由陈工提供完整文本）', must_accept: true },
    privacy: { version: 'v1.0', content: '...', must_accept: true },
  },
  maintenance_mode: false,
  watermark_text: 'AI 模拟预览，仅供娱乐参考，不构成医疗建议',
};

module.exports.up = async (db) => {
  // preset_items
  for (const p of presetItems) {
    await db.collection('preset_items').add({ ...p, created_at: new Date() });
  }
  // credit_packages
  for (const p of creditPackages) {
    await db.collection('credit_packages').add({ ...p, created_at: new Date() });
  }
  // system_configs
  for (const [key, value] of Object.entries(systemConfigs)) {
    await db.collection('system_configs').add({
      _id: key, value, updated_at: new Date(), updated_by: 'system',
    });
  }
};
```

> 注意：`_id` 重复会抛错。如果重跑，迁移框架会去重（已经在 `_migrations` 里）。

- [ ] **Step 3: 在 dev 环境跑迁移**

```bash
npx tcb fn run admin/_initDb -e mae-dev-xxxx
```

- [ ] **Step 4: 验证数据**

```bash
# 在云开发控制台数据库里查询：
db.collection('preset_items').count()  // 应为 20
db.collection('credit_packages').count()  // 应为 4
db.collection('system_configs').count()  // 应为 9
```

- [ ] **Step 5: 提交**

```bash
git add migrations/002_seed_data.js migrations/003_indexes.js
git commit -m "feat(db): 索引 + 预设项目/套餐/系统配置种子"
```

---

### Task 6: 共享工具模块（response / validator / jwt / crypto / logger）

**Files:**
- Create: `cloudfunctions/_shared/utils/response.js`, `validator.js`, `jwt.js`, `crypto.js`, `logger.js`
- Test: `tests/unit/_shared/utils/`

- [ ] **Step 1: 实现统一响应格式**

```javascript
// cloudfunctions/_shared/utils/response.js
const CODES = {
  OK: 0,
  UNAUTHORIZED: 401,
  INSUFFICIENT_CREDITS: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  UPSTREAM: 502,
  MAINTENANCE: 503,
};

function ok(data = null) { return { code: CODES.OK, message: 'ok', data }; }
function fail(code, message, data = null) { return { code, message, data }; }

module.exports = { CODES, ok, fail };
```

- [ ] **Step 2: 写测试**

```javascript
// tests/unit/_shared/utils/response.test.js
const { ok, fail, CODES } = require('../../../../cloudfunctions/_shared/utils/response');

test('ok returns success envelope', () => {
  expect(ok({ a: 1 })).toEqual({ code: 0, message: 'ok', data: { a: 1 } });
});
test('fail returns error envelope', () => {
  expect(fail(CODES.NOT_FOUND, 'not found')).toEqual({
    code: 404, message: 'not found', data: null,
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
npm run test:unit
```
Expected: PASS

- [ ] **Step 4: 实现 validator（基于 zod）**

```bash
npm install --workspace cloudfunctions/_shared zod
```

```javascript
// cloudfunctions/_shared/utils/validator.js
const { z } = require('zod');

const schemas = {
  login: z.object({ code: z.string().min(1) }),
  updateProfile: z.object({
    nickname: z.string().max(20).optional(),
    avatar: z.string().url().optional(),
  }),
  // ...其他 schema 按需添加
};

function validate(name, input) {
  const s = schemas[name];
  if (!s) throw new Error(`Schema ${name} not found`);
  return s.parse(input);  // throws ZodError
}

module.exports = { validate, schemas };
```

- [ ] **Step 5: 实现 jwt**

```bash
npm install --workspace cloudfunctions/_shared jsonwebtoken
```

```javascript
// cloudfunctions/_shared/utils/jwt.js
const jwt = require('jsonwebtoken');

function sign(payload, expiresIn = '30d') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}
function verify(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { sign, verify };
```

- [ ] **Step 6: 实现 crypto（AES）**

```bash
npm install --workspace cloudfunctions/_shared crypto-js
```

```javascript
// cloudfunctions/_shared/utils/crypto.js
const CryptoJS = require('crypto-js');

const KEY = process.env.FIELD_ENCRYPT_KEY;  // 32 字节 base64

function encrypt(plain) {
  return CryptoJS.AES.encrypt(plain, KEY).toString();
}
function decrypt(cipher) {
  const bytes = CryptoJS.AES.decrypt(cipher, KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

module.exports = { encrypt, decrypt };
```

- [ ] **Step 7: 实现 logger**

```javascript
// cloudfunctions/_shared/utils/logger.js
function info(msg, meta) { console.log(JSON.stringify({ level: 'info', msg, ...meta, ts: Date.now() })); }
function error(msg, meta) { console.error(JSON.stringify({ level: 'error', msg, ...meta, ts: Date.now() })); }
function warn(msg, meta) { console.warn(JSON.stringify({ level: 'warn', msg, ...meta, ts: Date.now() })); }

module.exports = { info, error, warn };
```

- [ ] **Step 8: 跑所有单元测试**

```bash
npm run test:unit
```
Expected: All PASS

- [ ] **Step 9: 提交**

```bash
git add cloudfunctions/_shared/ tests/
git commit -m "feat(shared): 响应/校验/JWT/加密/日志 工具"
```

---

### Task 7: 鉴权中间件

**Files:**
- Create: `cloudfunctions/_shared/middlewares/auth.js`, `adminAuth.js`, `errorHandler.js`
- Test: `tests/unit/_shared/middlewares/`

- [ ] **Step 1: 实现小程序端 auth（基于 openid）**

```javascript
// cloudfunctions/_shared/middlewares/auth.js
const cloud = require('wx-server-sdk');

/**
 * 解析小程序 openid 上下文。
 * 在云函数入口调用一次，结果存到 ctx.openid, ctx.userId
 */
async function resolveContext(event, context) {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  if (!openid) throw Object.assign(new Error('未登录'), { code: 401 });

  const db = cloud.database();
  const u = await db.collection('users').where({ openid }).limit(1).get();
  let user = u.data[0];

  if (!user) {
    // 自动创建账号
    const res = await db.collection('users').add({
      openid,
      nickname: '咨询师',
      avatar: '',
      credits: 0,
      status: 'active',
      created_at: new Date(),
      last_login_at: new Date(),
    });
    user = { _id: res.id, openid, credits: 0, status: 'active' };
  } else {
    // 更新 last_login_at
    await db.collection('users').doc(user._id).update({
      data: { last_login_at: new Date() },
    });
  }

  if (user.status !== 'active') {
    throw Object.assign(new Error('账号已被封禁'), { code: 403 });
  }
  return { openid, userId: user._id, user };
}

module.exports = { resolveContext };
```

- [ ] **Step 2: 实现运营后台 adminAuth**

```javascript
// cloudfunctions/_shared/middlewares/adminAuth.js
const { verify } = require('../utils/jwt');
const cloud = require('wx-server-sdk');

async function requireAdmin(event) {
  const token = event._token || event.token;
  if (!token) throw Object.assign(new Error('未登录'), { code: 401 });
  let payload;
  try { payload = verify(token); } catch (e) {
    throw Object.assign(new Error('token 失效'), { code: 401 });
  }
  if (payload.role !== 'super') {
    throw Object.assign(new Error('权限不足'), { code: 403 });
  }
  return { adminId: payload.sub, role: payload.role };
}

module.exports = { requireAdmin };
```

- [ ] **Step 3: 实现 errorHandler 包装器**

```javascript
// cloudfunctions/_shared/middlewares/errorHandler.js
const { CODES, fail } = require('../utils/response');
const { error: logError } = require('../utils/logger');

function withErrorHandler(handler) {
  return async (event, context) => {
    try {
      return await handler(event, context);
    } catch (e) {
      const code = e.code || CODES.INTERNAL;
      logError('handler error', { code, message: e.message, stack: e.stack });
      return fail(code, e.message);
    }
  };
}

module.exports = { withErrorHandler };
```

- [ ] **Step 4: 写测试**

```javascript
// tests/unit/_shared/middlewares/auth.test.js
const { resolveContext } = require('../../../../cloudfunctions/_shared/middlewares/auth');
// mock cloud & db
jest.mock('wx-server-sdk', () => {
  return {
    getWXContext: () => ({ OPENID: 'mock_openid' }),
    database: () => ({
      collection: () => ({
        where: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }),
        add: async () => ({ id: 'new_id' }),
        doc: () => ({ update: async () => {} }),
      }),
    }),
  };
});

test('create user on first login', async () => {
  const ctx = await resolveContext({}, {});
  expect(ctx.userId).toBe('new_id');
  expect(ctx.openid).toBe('mock_openid');
});
```

- [ ] **Step 5: 跑测试**

```bash
npm run test:unit
```
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/_shared/middlewares/ tests/
git commit -m "feat(shared): openid/admin 鉴权 + 错误处理中间件"
```

---

### Task 8: 阶段 1 验收

- [ ] **Step 1: 跑全部测试**

```bash
npm run test:unit
npm run test:integration  # 暂时只跑 unit
```

- [ ] **Step 2: 在云开发控制台验证 14 个集合存在 + 索引建立 + 种子数据写入**

- [ ] **Step 3: 打 tag**

```bash
git tag p1-foundation
git push --tags
```

- [ ] **Step 4: 陈工验收**

- 14 个集合已建
- 20 个预设项目可查
- 4 个套餐可查
- 9 条 system_configs 可查

---

## 3. 阶段 2（P2）：账号 + 积分 + 支付（W3-W4）

### Task 9: user.login 云函数

**Files:**
- Create: `cloudfunctions/user/login/index.js`, `package.json`

- [ ] **Step 1: 写云函数**

```javascript
// cloudfunctions/user/login/index.js
const cloud = require('wx-server-sdk');
const axios = require('axios');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { sign } = require('../../_shared/utils/jwt');
const { resolveContext } = require('../../_shared/middlewares/auth');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const APPID = process.env.WX_APPID;
const SECRET = process.env.WX_SECRET;

exports.main = withErrorHandler(async (event) => {
  const { code } = event;
  if (!code) return fail(CODES.NOT_FOUND, '缺少 code');

  // 1. 换 openid + session_key
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${APPID}&secret=${SECRET}&js_code=${code}&grant_type=authorization_code`;
  const { data } = await axios.get(url);
  if (data.errcode) return fail(CODES.UPSTREAM, `微信登录失败: ${data.errmsg}`);

  const openid = data.openid;
  // 2. 解析/创建用户
  const ctx = await resolveContext({ ...event, _openid: openid }, {});
  // 3. 签发 token
  const token = sign({ sub: ctx.userId, openid, role: 'user' }, '30d');
  return ok({ token, user: {
    _id: ctx.user._id,
    nickname: ctx.user.nickname,
    avatar: ctx.user.avatar,
    credits: ctx.user.credits,
  } });
});
```

- [ ] **Step 2: 写 package.json（云函数独立依赖）**

```json
{
  "name": "user-login",
  "version": "1.0.0",
  "dependencies": {
    "wx-server-sdk": "~2.6.3",
    "axios": "^1.6.0"
  }
}
```

- [ ] **Step 3: 部署云函数并测试**

```bash
# 在云开发控制台云函数页面 → 上传代码
# 或：
npx tcb fn deploy user/login -e mae-dev-xxxx
```

```bash
# 在云开发控制台测试：
{
  "code": "mock_jscode_from_wx_login"
}
```
Expected: `{ code: 0, data: { token, user: { _id, credits: 0, ... } } }`

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/user/login/
git commit -m "feat(user): login 云函数（wx.login → openid → JWT）"
```

---

### Task 10: user.profile / updateProfile / cancel

**Files:**
- Create: `cloudfunctions/user/profile/index.js`, `user/updateProfile/index.js`, `user/cancel/index.js`

- [ ] **Step 1: profile**

```javascript
// cloudfunctions/user/profile/index.js
const cloud = require('wx-server-sdk');
const { ok } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  return ok({
    _id: ctx.user._id,
    nickname: ctx.user.nickname,
    avatar: ctx.user.avatar,
    credits: ctx.user.credits,
    credits_expire_at: ctx.user.credits_expire_at,
    status: ctx.user.status,
  });
});
```

- [ ] **Step 2: updateProfile**

```javascript
// cloudfunctions/user/updateProfile/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
const { validate } = require('../../_shared/utils/validator');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  const patch = validate('updateProfile', event);
  if (Object.keys(patch).length === 0) return fail(CODES.NOT_FOUND, '无可更新字段');
  await cloud.database().collection('users').doc(ctx.userId).update({ data: patch });
  return ok({ updated: true });
});
```

- [ ] **Step 3: cancel（注销账号，PIPL）**

```javascript
// cloudfunctions/user/cancel/index.js
const cloud = require('wx-server-sdk');
const { ok } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  const deleteAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await cloud.database().collection('users').doc(ctx.userId).update({
    data: { status: 'canceled', cancel_requested_at: new Date(), scheduled_delete_at: deleteAt },
  });
  return ok({ delete_at: deleteAt });
});
```

- [ ] **Step 4: 部署 + 测试三个函数**

```bash
npx tcb fn deploy user/profile -e mae-dev-xxxx
npx tcb fn deploy user/updateProfile -e mae-dev-xxxx
npx tcb fn deploy user/cancel -e mae-dev-xxxx
```

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/user/
git commit -m "feat(user): profile/updateProfile/cancel"
```

---

### Task 11: credit.ledger 服务（积分事务）

**Files:**
- Create: `cloudfunctions/_shared/services/creditledger/index.js`
- Test: `tests/unit/_shared/services/creditledger.test.js`

- [ ] **Step 1: 写测试**

```javascript
// tests/unit/_shared/services/creditledger.test.js
const ledger = require('../../../../../cloudfunctions/_shared/services/creditledger');

jest.mock('wx-server-sdk', () => ({
  database: () => ({
    collection: (name) => ({
      add: jest.fn(async (doc) => ({ id: 'mock_id' })),
      where: () => ({
        get: jest.fn(async () => ({ data: [] })),
      }),
    }),
    runTransaction: jest.fn(async (cb) => {
      const tx = {
        collection: () => ({
          where: () => ({ get: jest.fn(async () => ({ data: [] })) }),
          update: jest.fn(async () => {}),
        }),
      };
      return cb(tx);
    }),
  }),
}));

test('consume deducts credits and writes ledger', async () => {
  const result = await ledger.consume({ userId: 'u1', amount: 5, relatedId: 'g1', note: 'test' });
  expect(result).toEqual({ ok: true, balance_after: -5 });
});
```

- [ ] **Step 2: 实现**

```javascript
// cloudfunctions/_shared/services/creditledger/index.js
const cloud = require('wx-server-sdk');
const { CODES, fail } = require('../../utils/response');

function makeError(code, msg) {
  return Object.assign(new Error(msg), { code });
}

async function consume({ userId, amount, relatedId, note }) {
  if (amount <= 0) throw makeError(CODES.INTERNAL, 'amount must be positive');
  return await cloud.database().runTransaction(async (tx) => {
    const users = tx.collection('users').doc(userId);
    const u = await users.get();
    if (!u.data) throw makeError(CODES.NOT_FOUND, 'user not found');
    if (u.data.status !== 'active') throw makeError(CODES.FORBIDDEN, '账号已封禁或注销');
    if ((u.data.credits || 0) < amount) throw makeError(CODES.INSUFFICIENT_CREDITS, '积分不足');

    const newBalance = u.data.credits - amount;
    await users.update({ data: { credits: newBalance, updated_at: new Date() } });
    await tx.collection('credit_ledger').add({
      user_id: userId,
      type: 'consume',
      amount: -amount,
      balance_after: newBalance,
      related_id: relatedId,
      note: note || '',
      created_at: new Date(),
    });
    return { ok: true, balance_after: newBalance };
  });
}

async function recharge({ userId, amount, relatedId, note }) {
  if (amount <= 0) throw makeError(CODES.INTERNAL, 'amount must be positive');
  return await cloud.database().runTransaction(async (tx) => {
    const users = tx.collection('users').doc(userId);
    const u = await users.get();
    if (!u.data) throw makeError(CODES.NOT_FOUND, 'user not found');
    const newBalance = (u.data.credits || 0) + amount;
    await users.update({ data: { credits: newBalance, updated_at: new Date() } });
    await tx.collection('credit_ledger').add({
      user_id: userId,
      type: 'recharge',
      amount: +amount,
      balance_after: newBalance,
      related_id: relatedId,
      note: note || '',
      created_at: new Date(),
    });
    return { ok: true, balance_after: newBalance };
  });
}

async function refund({ userId, amount, relatedId, note }) {
  if (amount <= 0) throw makeError(CODES.INTERNAL, 'amount must be positive');
  return await cloud.database().runTransaction(async (tx) => {
    const users = tx.collection('users').doc(userId);
    const u = await users.get();
    if (!u.data) throw makeError(CODES.NOT_FOUND, 'user not found');
    const newBalance = (u.data.credits || 0) + amount;
    await users.update({ data: { credits: newBalance, updated_at: new Date() } });
    await tx.collection('credit_ledger').add({
      user_id: userId,
      type: 'refund',
      amount: +amount,
      balance_after: newBalance,
      related_id: relatedId,
      note: note || '',
      created_at: new Date(),
    });
    return { ok: true, balance_after: newBalance };
  });
}

module.exports = { consume, recharge, refund };
```

- [ ] **Step 3: 跑测试**

```bash
npm run test:unit
```
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/_shared/services/creditledger/ tests/
git commit -m "feat(shared): creditledger 事务（consume/recharge/refund）"
```

---

### Task 12: wechatpay 服务（v3 封装）

**Files:**
- Create: `cloudfunctions/_shared/services/wechatpay/index.js`
- 复用: 微信支付 v3 Node SDK（`wechatpay-node-v3`）

- [ ] **Step 1: 安装 SDK**

```bash
npm install --workspace cloudfunctions/_shared wechatpay-node-v3
```

- [ ] **Step 2: 写实现**

```javascript
// cloudfunctions/_shared/services/wechatpay/index.js
const WxPay = require('wechatpay-node-v3').default;
const { info, error } = require('../../utils/logger');

const pay = new WxPay({
  appid: process.env.WX_APPID,
  mchid: process.env.WX_MCH_ID,
  publicKey: Buffer.from(process.env.WX_PUBLIC_KEY, 'utf8'),
  privateKey: Buffer.from(process.env.WX_PRIVATE_KEY, 'utf8'),
  key: process.env.WX_API_V3_KEY,
});

async function createJsapiOrder({ outTradeNo, description, amountCents, openid }) {
  const result = await pay.transactions_jsapi({
    description,
    out_trade_no: outTradeNo,
    notify_url: process.env.WX_PAY_NOTIFY_URL,
    amount: { total: amountCents, currency: 'CNY' },
    payer: { openid },
  });
  return result;
}

async function verifyNotify(headers, body) {
  // SDK 内置验签
  const result = await pay.verifySign(headers, body);
  return result;
}

async function refund({ outTradeNo, outRefundNo, reason, amountCents }) {
  const result = await pay.refunds({
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason,
    amount: { refund: amountCents, total: amountCents, currency: 'CNY' },
  });
  return result;
}

module.exports = { createJsapiOrder, verifyNotify, refund };
```

- [ ] **Step 3: 在云开发控制台配置环境变量**

```
WX_APPID
WX_SECRET
WX_MCH_ID           # 商户号
WX_API_V3_KEY       # API v3 密钥
WX_PUBLIC_KEY       # 平台公钥 (PEM)
WX_PRIVATE_KEY      # 商户私钥 (PEM)
WX_PAY_NOTIFY_URL   # 支付回调 URL
JWT_SECRET
FIELD_ENCRYPT_KEY   # 32 字节 base64
TONGYI_API_KEY      # AI 厂商 key
HUNYUAN_API_KEY
```

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/_shared/services/wechatpay/
git commit -m "feat(pay): 微信支付 v3 封装（JSAPI/notify/refund）"
```

---

### Task 13: order.create 云函数

**Files:**
- Create: `cloudfunctions/order/create/index.js`

- [ ] **Step 1: 实现**

```javascript
// cloudfunctions/order/create/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
const { createJsapiOrder } = require('../../_shared/services/wechatpay');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function genOrderNo() {
  const ts = new Date();
  const ymd = ts.getFullYear().toString() +
    String(ts.getMonth() + 1).padStart(2, '0') +
    String(ts.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 1e6).toString().padStart(6, '0');
  return `${ymd}${rand}`;
}

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  const { package_id } = event;
  if (!package_id) return fail(CODES.NOT_FOUND, '缺少 package_id');

  const db = cloud.database();
  const pkgRes = await db.collection('credit_packages').doc(package_id).get();
  if (!pkgRes.data || !pkgRes.data.is_active) return fail(CODES.NOT_FOUND, '套餐不存在或已下架');
  const pkg = pkgRes.data;

  const orderNo = genOrderNo();
  await db.collection('orders').add({
    order_no: orderNo,
    user_id: ctx.userId,
    package_id: pkg._id,
    credits: pkg.credits + pkg.bonus_credits,
    amount_cents: pkg.price_cents,
    status: 'pending',
    created_at: new Date(),
  });

  const wxRes = await createJsapiOrder({
    outTradeNo: orderNo,
    description: `积分套餐-${pkg.name}`,
    amountCents: pkg.price_cents,
    openid: ctx.openid,
  });

  return ok({ order_no: orderNo, prepay: wxRes });
});
```

- [ ] **Step 2: 部署 + 测试**

```bash
npx tcb fn deploy order/create -e mae-dev-xxxx
```

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/order/create/
git commit -m "feat(order): create 云函数（调起微信支付）"
```

---

### Task 14: pay.callback 云函数（HTTP 触发）

**Files:**
- Create: `cloudfunctions/pay/callback/index.js`, `config.json`（HTTP 触发配置）

- [ ] **Step 1: 写云函数**

```javascript
// cloudfunctions/pay/callback/index.js
const cloud = require('wx-server-sdk');
const { verifyNotify } = require('../../_shared/services/wechatpay');
const { recharge } = require('../../_shared/services/creditledger');
const { info, error } = require('../../_shared/utils/logger');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const headers = event.headers || {};
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const verified = await verifyNotify(headers, body);
  if (!verified) {
    error('pay notify verify failed', { body });
    return { code: 'FAIL', message: '验签失败' };
  }
  if (body.event_type !== 'TRANSACTION.SUCCESS') {
    return { code: 'SUCCESS' };  // 其它事件类型忽略
  }
  const { out_trade_no, transaction_id, amount } = body.resource || body;  // 兼容字段
  const orderNo = body.out_trade_no || out_trade_no;

  const db = cloud.database();
  const orderRes = await db.collection('orders').where({ order_no: orderNo }).limit(1).get();
  const order = orderRes.data[0];
  if (!order) return { code: 'FAIL', message: '订单不存在' };
  if (order.status === 'paid') return { code: 'SUCCESS' };  // 重复回调
  if (order.amount_cents !== (amount?.total || body.amount?.total)) {
    return { code: 'FAIL', message: '金额不一致' };
  }

  // 更新订单
  await db.collection('orders').doc(order._id).update({
    data: {
      status: 'paid',
      wx_txn_id: transaction_id || body.transaction_id,
      paid_at: new Date(),
    },
  });

  // 入账积分
  await recharge({
    userId: order.user_id,
    amount: order.credits,
    relatedId: order._id,
    note: `购买套餐 ${orderNo}`,
  });

  info('order paid & credits granted', { orderNo, credits: order.credits });
  return { code: 'SUCCESS' };
});

const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
```

- [ ] **Step 2: 配置 HTTP 触发**

```json
// cloudfunctions/pay/callback/config.json
{
  "triggers": [{
    "name": "payCallback",
    "type": "http",
    "config": {
      "method": "POST",
      "path": "/pay/callback"
    }
  }]
}
```

- [ ] **Step 3: 部署**

```bash
npx tcb fn deploy pay/callback -e mae-dev-xxxx
```

- [ ] **Step 4: 在微信支付商户平台配置回调 URL**

```
URL: https://{env-id}.service.tcloudbase.com/pay/callback
```

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/pay/callback/
git commit -m "feat(pay): callback 验签+入账"
```

---

### Task 15: order.list / order.detail / credit.packages / agreement

**Files:**
- Create: `cloudfunctions/order/list/index.js`, `order/detail/index.js`, `credit/packages/index.js`, `agreement/current/index.js`, `agreement/accept/index.js`

- [ ] **Step 1: credit.packages**

```javascript
// cloudfunctions/credit/packages/index.js
const cloud = require('wx-server-sdk');
const { ok } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async () => {
  const res = await cloud.database().collection('credit_packages')
    .where({ is_active: true })
    .orderBy('sort_order', 'asc')
    .get();
  return ok({ packages: res.data });
});
```

- [ ] **Step 2: order.list**

```javascript
// cloudfunctions/order/list/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  const { page = 1, status } = event;
  const PAGE_SIZE = 20;
  let q = cloud.database().collection('orders').where({ user_id: ctx.userId });
  if (status) q = q.where({ status });
  const res = await q
    .orderBy('created_at', 'desc')
    .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).get();
  return ok({ orders: res.data, page, has_more: res.data.length === PAGE_SIZE });
});
```

- [ ] **Step 3: order.detail**

```javascript
// cloudfunctions/order/detail/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  if (!event.order_no) return fail(CODES.NOT_FOUND, '缺少 order_no');
  const res = await cloud.database().collection('orders')
    .where({ order_no: event.order_no, user_id: ctx.userId })
    .limit(1).get();
  if (!res.data[0]) return fail(CODES.NOT_FOUND, '订单不存在');
  return ok({ order: res.data[0] });
});
```

- [ ] **Step 4: agreement.current**

```javascript
// cloudfunctions/agreement/current/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  if (!['user', 'privacy'].includes(event.type)) return fail(CODES.NOT_FOUND, 'type 错误');
  const res = await cloud.database().collection('system_configs')
    .doc(`protocols.${event.type}`).get();
  if (!res.data) return fail(CODES.NOT_FOUND, '协议未配置');
  return ok({ version: res.data.value.version, content: res.data.value.content, must_accept: res.data.value.must_accept });
});
```

- [ ] **Step 5: agreement.accept**

```javascript
// cloudfunctions/agreement/accept/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  if (!['user', 'privacy'].includes(event.type)) return fail(CODES.NOT_FOUND, 'type 错误');
  if (!event.version) return fail(CODES.NOT_FOUND, '缺少 version');
  await cloud.database().collection('user_agreements').add({
    user_id: ctx.userId,
    type: event.type,
    version: event.version,
    accepted_at: new Date(),
  });
  return ok({ accepted: true });
});
```

- [ ] **Step 6: 部署 + 提交**

```bash
npx tcb fn deploy credit/packages order/list order/detail agreement/current agreement/accept -e mae-dev-xxxx
git add cloudfunctions/credit/ cloudfunctions/order/list/ cloudfunctions/order/detail/ cloudfunctions/agreement/
git commit -m "feat: packages/list/detail/agreement 云函数"
```

---

### Task 16: 小程序登录页 + 我的页

**Files:**
- Create: `miniprogram/pages/login/index.{js,wxml,wxss,json}`, `miniprogram/pages/profile/index.{js,wxml,wxss,json}`, `miniprogram/utils/{api,auth}.js`

- [ ] **Step 1: api 封装**

```javascript
// miniprogram/utils/api.js
function callFn(name, data = {}) {
  return wx.cloud.callFunction({ name, data })
    .then(res => {
      if (res.result.code !== 0) {
        return Promise.reject(Object.assign(new Error(res.result.message), { code: res.result.code }));
      }
      return res.result.data;
    });
}
module.exports = { callFn };
```

- [ ] **Step 2: auth 工具**

```javascript
// miniprogram/utils/auth.js
const { callFn } = require('./api');

const STORAGE_KEY = 'mae_token';

async function login() {
  const { code } = await wx.login();
  const data = await callFn('user/login', { code });
  wx.setStorageSync(STORAGE_KEY, data.token);
  return data.user;
}

function getToken() { return wx.getStorageSync(STORAGE_KEY); }
function logout() { wx.removeStorageSync(STORAGE_KEY); }

module.exports = { login, getToken, logout, STORAGE_KEY };
```

- [ ] **Step 3: 登录页**

```javascript
// miniprogram/pages/login/index.js
const { login } = require('../../utils/auth');
const { callFn } = require('../../utils/api');

Page({
  data: { loading: false, agreementChecked: false, showAgreementModal: false },
  onLoad() { this.checkAgreement(); },
  async checkAgreement() {
    const data = await callFn('agreement/current', { type: 'privacy' });
    const accepted = wx.getStorageSync(`privacy_${data.version}`);
    if (!accepted) this.setData({ showAgreementModal: true, privacyVersion: data.version });
  },
  async onTapLogin() {
    if (!this.data.agreementChecked) return wx.showToast({ title: '请先同意协议', icon: 'none' });
    this.setData({ loading: true });
    try {
      await login();
      wx.setStorageSync(`privacy_${this.data.privacyVersion}`, true);
      wx.switchTab({ url: '/pages/dashboard/index' });
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },
  onAgreementChange(e) { this.setData({ agreementChecked: e.detail.value.length > 0 }); },
  onViewAgreement() { wx.navigateTo({ url: '/pages/agreement/index?type=privacy' }); },
});
```

```xml
<!-- miniprogram/pages/login/index.wxml -->
<view class="container">
  <view class="title">医美 AI 预览</view>
  <view class="subtitle">为咨询师而生</view>
  <button class="btn-primary" loading="{{loading}}" bindtap="onTapLogin">微信授权登录</button>
  <checkbox-group bindchange="onAgreementChange">
    <label>
      <checkbox value="1" /> 我已阅读并同意
      <text class="link" bindtap="onViewAgreement">《隐私政策》《用户协议》</text>
    </label>
  </checkbox-group>
</view>
```

```css
/* miniprogram/pages/login/index.wxss */
.container { display:flex; flex-direction:column; align-items:center; padding:80rpx 40rpx; }
.title { font-size:48rpx; font-weight:600; color:#3d2e2a; margin-top:80rpx; }
.subtitle { font-size:28rpx; color:#a08c87; margin-top:16rpx; margin-bottom:120rpx; }
.btn-primary { background:#d4a5a0; color:white; width:80%; border-radius:44rpx; }
.link { color:#d4a5a0; text-decoration:underline; }
```

- [ ] **Step 4: 我的页（简化版，P4 完善）**

```javascript
// miniprogram/pages/profile/index.js
const { callFn } = require('../../utils/api');
const { logout } = require('../../utils/auth');

Page({
  data: { user: null, credits: 0 },
  onShow() { this.loadProfile(); },
  async loadProfile() {
    const data = await callFn('user/profile');
    this.setData({ user: data, credits: data.credits });
  },
  onTapRecharge() { wx.navigateTo({ url: '/pages/recharge/index' }); },
  onTapHistory() { wx.navigateTo({ url: '/pages/history/index' }); },
  onTapAgreement(e) {
    const type = e.currentTarget.dataset.type;
    wx.navigateTo({ url: `/pages/agreement/index?type=${type}` });
  },
  async onTapCancel() {
    const res = await wx.showModal({ title: '确认注销', content: '30 天后账号数据将被清除', editable: false });
    if (res.confirm) {
      await callFn('user/cancel');
      logout();
      wx.reLaunch({ url: '/pages/login/index' });
    }
  },
});
```

- [ ] **Step 5: 部署小程序 + 在开发者工具里点登录 → 跳到我的页**

- [ ] **Step 6: 提交**

```bash
git add miniprogram/
git commit -m "feat(miniprogram): 登录页 + 我的页 + auth/api 工具"
```

---

### Task 17: 充值页 + 协议页

**Files:**
- Create: `miniprogram/pages/recharge/index.{js,wxml,wxss,json}`, `miniprogram/pages/agreement/index.{js,wxml,wxss,json}`

- [ ] **Step 1: 充值页（核心 JS）**

```javascript
// miniprogram/pages/recharge/index.js
const { callFn } = require('../../utils/api');

Page({
  data: { packages: [], selected: null, agreementChecked: false, loading: false },
  onLoad() { this.loadPackages(); },
  async loadPackages() {
    const data = await callFn('credit/packages');
    this.setData({ packages: data.packages });
  },
  onSelect(e) {
    this.setData({ selected: this.data.packages.find(p => p._id === e.currentTarget.dataset.id) });
  },
  onAgreementChange(e) { this.setData({ agreementChecked: e.detail.value.length > 0 }); },
  async onPay() {
    if (!this.data.selected) return wx.showToast({ title: '请选择套餐', icon: 'none' });
    if (!this.data.agreementChecked) return wx.showToast({ title: '请先同意协议', icon: 'none' });
    this.setData({ loading: true });
    try {
      const { order_no, prepay } = await callFn('order/create', { package_id: this.data.selected._id });
      await wx.requestPayment({
        timeStamp: prepay.timeStamp,
        nonceStr: prepay.nonceStr,
        package: prepay.package,
        signType: prepay.signType || 'RSA',
        paySign: prepay.paySign,
      });
      wx.redirectTo({ url: `/pages/order-detail/index?order_no=${order_no}` });
    } catch (e) { wx.showToast({ title: e.message || '支付失败', icon: 'none' }); }
    finally { this.setData({ loading: false }); }
  },
});
```

```xml
<!-- miniprogram/pages/recharge/index.wxml -->
<view class="container">
  <view class="title">选择套餐</view>
  <view class="grid">
    <view wx:for="{{packages}}" wx:key="_id"
      class="pkg {{selected._id === item._id ? 'selected' : ''}}"
      data-id="{{item._id}}" bindtap="onSelect">
      <view class="pkg-name">{{item.name}}</view>
      <view class="pkg-credits">{{item.credits}}<text wx:if="{{item.bonus_credits > 0}}">+{{item.bonus_credits}}</text></view>
      <view class="pkg-unit">积分</view>
      <view class="pkg-price">¥{{item.price_cents/100}}</view>
    </view>
  </view>
  <checkbox-group bindchange="onAgreementChange">
    <label><checkbox value="1" /> 已阅读并同意《用户协议》《隐私政策》</label>
  </checkbox-group>
  <button class="btn-pay" loading="{{loading}}" disabled="{{!selected}}" bindtap="onPay">
    微信支付 {{selected ? '¥' + selected.price_cents/100 : ''}}
  </button>
</view>
```

- [ ] **Step 2: 协议页**

```javascript
// miniprogram/pages/agreement/index.js
const { callFn } = require('../../utils/api');
Page({
  data: { type: 'user', content: '', version: '' },
  onLoad(options) {
    this.setData({ type: options.type || 'user' });
    this.loadAgreement();
  },
  async loadAgreement() {
    const data = await callFn('agreement/current', { type: this.data.type });
    this.setData({ content: data.content, version: data.version });
  },
});
```

```xml
<view class="container">
  <view class="version">版本：{{version}}</view>
  <rich-text nodes="{{content}}"></rich-text>
</view>
```

- [ ] **Step 3: 部署 + 在开发者工具里跑通 "登录 → 充值 → 选套餐 → 调起支付（沙箱）"**

- [ ] **Step 4: 提交**

```bash
git add miniprogram/pages/recharge/ miniprogram/pages/agreement/
git commit -m "feat(miniprogram): 充值 + 协议页"
```

---

### Task 18: 阶段 2 验收

- [ ] **Step 1: E2E 流程手测**
  - 登录 → 进工作台
  - 进充值页 → 选标准套餐 → 调起支付（沙箱环境）
  - 支付回调 → 查 `orders.status=paid`, `users.credits=220`
  - 进我的页 → 看到 220 积分

- [ ] **Step 2: 跑单元测试**

```bash
npm run test:unit
```
Expected: All PASS

- [ ] **Step 3: 打 tag**

```bash
git tag p2-auth-payment
git push --tags
```

---

## 4. 阶段 3（P3）：AI 集成（W5-W6）

### Task 19: AIService 提示词拼接器

**Files:**
- Create: `cloudfunctions/_shared/services/aiservice/prompt.js`
- Test: `tests/unit/_shared/services/aiservice/prompt.test.js`

- [ ] **Step 1: 写测试**

```javascript
// tests/unit/_shared/services/aiservice/prompt.test.js
const { buildPrompt } = require('../../../../../../cloudfunctions/_shared/services/aiservice/prompt');

test('single preset no user text', () => {
  const out = buildPrompt({
    presets: [{ default_prompt: 'subtly raise nose bridge' }],
    userText: '',
    prefix: 'PREFIX, ',
    suffix: ', SUFFIX',
  });
  expect(out).toBe('PREFIX, subtly raise nose bridge, SUFFIX');
});

test('multiple presets joined with AND', () => {
  const out = buildPrompt({
    presets: [
      { default_prompt: 'a' },
      { default_prompt: 'b' },
      { default_prompt: 'c' },
    ],
    userText: '',
    prefix: 'P, ',
    suffix: ', S',
  });
  expect(out).toBe('P, a AND b AND c, S');
});

test('presets + user text', () => {
  const out = buildPrompt({
    presets: [{ default_prompt: 'a' }],
    userText: 'natural look',
    prefix: 'P, ',
    suffix: ', S',
  });
  expect(out).toBe('P, a, natural look, S');
});
```

- [ ] **Step 2: 实现**

```javascript
// cloudfunctions/_shared/services/aiservice/prompt.js
function buildPrompt({ presets, userText, prefix, suffix }) {
  const parts = presets.map(p => p.default_prompt).join(' AND ');
  let result = (prefix || '') + parts;
  if (userText && userText.trim()) {
    result += ', ' + userText.trim();
  }
  result += (suffix || '');
  return result;
}

module.exports = { buildPrompt };
```

- [ ] **Step 3: 跑测试**

```bash
npm run test:unit -- prompt
```
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add cloudfunctions/_shared/services/aiservice/prompt.js tests/
git commit -m "feat(aiservice): 提示词拼接器"
```

---

### Task 20: AIService 厂商适配器（tongyi + hunyuan mock）

**Files:**
- Create: `cloudfunctions/_shared/services/aiservice/adapters/tongyi.js`, `hunyuan.js`, `mock.js`, `index.js`

- [ ] **Step 1: 写 mock 适配器（先跑通流程）**

```javascript
// cloudfunctions/_shared/services/aiservice/adapters/mock.js
async function edit({ imageUrl, prompt, strength = 0.7 }) {
  // mock：直接返回原图 URL
  await new Promise(r => setTimeout(r, 100));
  return { resultUrl: imageUrl, vendorMeta: { mock: true } };
}
module.exports = { edit };
```

- [ ] **Step 2: 写通义适配器（真实 API）**

```javascript
// cloudfunctions/_shared/services/aiservice/adapters/tongyi.js
const axios = require('axios');

async function edit({ imageUrl, prompt }) {
  const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis';
  const res = await axios.post(url, {
    model: 'wanx-v1',
    input: { image_url: imageUrl, prompt },
    parameters: { style: '<photography>', n: 1 },
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.TONGYI_API_KEY}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
  });
  // 异步任务：轮询 task
  const taskId = res.data.output.task_id;
  return await pollTongyiTask(taskId);
}

async function pollTongyiTask(taskId) {
  const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await axios.get(url, { headers: { Authorization: `Bearer ${process.env.TONGYI_API_KEY}` } });
    if (r.data.output.task_status === 'SUCCEEDED') {
      return { resultUrl: r.data.output.results[0].url, vendorMeta: { task_id: taskId } };
    }
    if (r.data.output.task_status === 'FAILED') {
      throw Object.assign(new Error('tongyi failed: ' + JSON.stringify(r.data)), { code: 502 });
    }
  }
  throw Object.assign(new Error('tongyi timeout'), { code: 504 });
}

module.exports = { edit };
```

- [ ] **Step 3: 写腾讯混元适配器（v1 暂以 stub 实现，明确报错）**

```javascript
// cloudfunctions/_shared/services/aiservice/adapters/hunyuan.js
const axios = require('axios');

/**
 * 腾讯混元 image editing 适配器。
 * 截至 2026-06，混元图像编辑 API 形态如下（以官方文档为准）：
 *   POST https://hunyuan.tencent.com/v1/image/edit
 *   Headers: Authorization: TC3-HMAC-SHA256 ... （TC3 签名）
 *   Body: { ImageUrl, Prompt, Strength, ... }
 *
 * v1 实施时需要：
 *   1. 用 process.env.HUNYUAN_SECRET_ID + SECRET_KEY 做 TC3 签名
 *   2. 提交异步任务拿到 TaskId
 *   3. 轮询结果（用 SDK 或自写）
 *
 * 本文件为 v1 占位：明确抛出"未启用"错误，让主流程走"备失败 → 退积分"分支。
 */
async function edit({ imageUrl, prompt }) {
  throw Object.assign(
    new Error('hunyuan adapter is a v1 stub, please implement in Task W5-HU'),
    { code: 501 }
  );
}
module.exports = { edit };
```

> **实施 W5 时**：开通腾讯云混元服务 + 填 HUNYUAN_SECRET_ID/SECRET_KEY + 实现 `pollHunyuanTask()`，参考通义适配器结构。

- [ ] **Step 4: 写 AIService 入口（路由 + 重试 + 降级）**

```javascript
// cloudfunctions/_shared/services/aiservice/index.js
const cloud = require('wx-server-sdk');
const { buildPrompt } = require('./prompt');
const tongyi = require('./adapters/tongyi');
const hunyuan = require('./adapters/hunyuan');
const mock = require('./adapters/mock');
const { error: logError } = require('../../utils/logger');

const ADAPTERS = { tongyi, hunyuan, mock };

async function loadConfig() {
  const res = await cloud.database().collection('system_configs')
    .doc('ai_models').get();
  return res.data ? res.data.value : { primary: { vendor: 'mock' } };
}

async function dispense({ imageUrl, presets, userText, userId, generationId }) {
  const config = await loadConfig();
  const promptCfg = await cloud.database().collection('system_configs')
    .doc('ai_prompt_prefix').get();
  const suffixCfg = await cloud.database().collection('system_configs')
    .doc('ai_prompt_suffix').get();

  const prompt = buildPrompt({
    presets,
    userText,
    prefix: promptCfg.data?.value || '',
    suffix: suffixCfg.data?.value || '',
  });

  // 主模型
  try {
    const adapter = ADAPTERS[config.primary.vendor];
    if (!config.primary.enabled) throw new Error('primary disabled');
    return await callWithTimeout(adapter, { imageUrl, prompt }, 25000);
  } catch (primaryErr) {
    logError('primary model failed', { err: primaryErr.message, userId, generationId });
    if (!config.allow_fallback) throw primaryErr;
    // 切备
    try {
      const sec = ADAPTERS[config.secondary.vendor];
      if (!config.secondary.enabled) throw new Error('secondary disabled');
      return await callWithTimeout(sec, { imageUrl, prompt }, 25000);
    } catch (secErr) {
      logError('secondary model failed', { err: secErr.message, userId, generationId });
      throw Object.assign(new Error('AI 生成失败'), { code: 502 });
    }
  }
}

function callWithTimeout(adapter, args, ms) {
  return Promise.race([
    adapter.edit(args),
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 504 })), ms)),
  ]);
}

module.exports = { dispense };
```

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/_shared/services/aiservice/
git commit -m "feat(aiservice): 路由 + 主备 + 超时（mock/tongyi/hunyuan 适配器）"
```

---

### Task 21: RateLimiter 令牌桶

**Files:**
- Create: `cloudfunctions/_shared/services/ratelimiter/index.js`
- Test: `tests/unit/_shared/services/ratelimiter.test.js`

- [ ] **Step 1: 写测试**

```javascript
// tests/unit/_shared/services/ratelimiter.test.js
jest.mock('wx-server-sdk', () => ({
  database: () => ({
    collection: () => ({
      doc: (id) => ({
        get: jest.fn(async () => ({ data: { _id: id, tokens: 5, updated_at: new Date() } })),
        set: jest.fn(async () => {}),
        update: jest.fn(async () => {}),
      }),
    }),
  }),
}));

const rl = require('../../../../../cloudfunctions/_shared/services/ratelimiter');

test('first check consumes one token', async () => {
  const r = await rl.check('user1', { per_minute: 5, per_day: 50, burst: 3 });
  expect(r.allowed).toBe(true);
});
test('denies when tokens exhausted', async () => {
  // mock tokens=0
  // ...
});
```

- [ ] **Step 2: 实现**

```javascript
// cloudfunctions/_shared/services/ratelimiter/index.js
const cloud = require('wx-server-sdk');

const BUCKET_TTL = 60;  // 1 min
const REFILL_PER_MIN = 5;  // 与 system_configs.rate_limit.per_minute 一致

async function check(userId, config) {
  const db = cloud.database();
  const now = new Date();
  const bucket = await db.collection('rate_limit_buckets').doc(userId).get();
  let tokens = bucket.data?.tokens ?? config.per_minute;
  const lastUpdate = bucket.data?.updated_at ?? now;
  const elapsedMin = Math.floor((now - new Date(lastUpdate)) / 60000);
  if (elapsedMin > 0) {
    tokens = Math.min(config.per_minute, tokens + elapsedMin * config.per_minute);
  }
  if (tokens <= 0) {
    await db.collection('rate_limit_buckets').doc(userId).set({
      data: { _id: userId, tokens, updated_at: now },
    });
    return { allowed: false, retry_after: 60 };
  }
  tokens -= 1;
  await db.collection('rate_limit_buckets').doc(userId).set({
    data: { _id: userId, tokens, updated_at: now },
  });
  return { allowed: true, tokens_left: tokens };
}

module.exports = { check };
```

- [ ] **Step 3: 跑测试 + 提交**

```bash
npm run test:unit
git add cloudfunctions/_shared/services/ratelimiter/ tests/
git commit -m "feat(ratelimit): 令牌桶限流"
```

---

### Task 22: ImageStorage / ImageAudit / AuditLog / SubscribeMsg 服务

**Files:**
- Create: 4 个服务的实现 + 测试

- [ ] **Step 1: ImageStorage（云存储封装）**

```javascript
// cloudfunctions/_shared/services/imagestorage/index.js
const cloud = require('wx-server-sdk');

async function uploadBuffer(buffer, cloudPath) {
  return await cloud.uploadFile({ cloudPath, fileContent: buffer });
}

async function getTempUrl(fileID, expires = 3600) {
  return (await cloud.getTempFileURL({ fileList: [fileID] })).fileList[0].tempFileURL;
}

async function deleteFiles(fileIDs) {
  return await cloud.deleteFile({ fileList: fileIDs });
}

module.exports = { uploadBuffer, getTempUrl, deleteFiles };
```

- [ ] **Step 2: ImageAudit（图片安全）**

```javascript
// cloudfunctions/_shared/services/imageaudit/index.js
const cloud = require('wx-server-sdk');

async function checkImage(mediaUrl) {
  try {
    const r = await cloud.openapi.security.imgSecCheck({ mediaUrl });
    // 0=正常, 非0=违规
    return { pass: r.errCode === 0, errCode: r.errCode };
  } catch (e) {
    return { pass: false, errCode: e.errCode || 500 };
  }
}

module.exports = { checkImage };
```

- [ ] **Step 3: AuditLog（写审计）**

```javascript
// cloudfunctions/_shared/services/auditlog/index.js
const cloud = require('wx-server-sdk');

async function log(event) {
  return await cloud.database().collection('ai_call_logs').add({
    ...event,
    created_at: new Date(),
  });
}

module.exports = { log };
```

- [ ] **Step 4: SubscribeMsg（订阅消息）**

```javascript
// cloudfunctions/_shared/services/subscribemsg/index.js
const cloud = require('wx-server-sdk');

async function sendGenerationResult({ openid, generationId, success, errorMsg }) {
  const tmplId = process.env.WX_SUBSCRIBE_TMPL_ID;  // 在小程序后台申请
  const data = success
    ? { thing1: { value: 'AI 预览已生成' }, time2: { value: new Date().toLocaleString('zh-CN') }, thing3: { value: '点击查看结果' } }
    : { thing1: { value: 'AI 预览生成失败' }, time2: { value: new Date().toLocaleString('zh-CN') }, thing3: { value: (errorMsg || '请稍后重试').slice(0, 20) } };
  return await cloud.openapi.subscribeMessage.send({
    touser: openid,
    templateId: tmplId,
    page: `pages/result/index?id=${generationId}`,
    data,
  });
}

module.exports = { sendGenerationResult };
```

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/_shared/services/{imagestorage,imageaudit,auditlog,subscribemsg}/
git commit -m "feat(shared): imagestorage/imageaudit/auditlog/subscribemsg 服务"
```

---

### Task 23: preset.list 云函数

**Files:**
- Create: `cloudfunctions/preset/list/index.js`

- [ ] **Step 1: 写云函数**

```javascript
// cloudfunctions/preset/list/index.js
const cloud = require('wx-server-sdk');
const { ok } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async () => {
  const res = await cloud.database().collection('preset_items')
    .where({ is_active: true })
    .orderBy('sort_order', 'asc')
    .get();
  // 按 category 分组
  const map = {};
  for (const p of res.data) {
    if (!map[p.category]) map[p.category] = [];
    map[p.category].push(p);
  }
  return ok({
    items: res.data,
    categories: Object.keys(map).map(cat => ({ name: cat, items: map[cat] })),
  });
});
```

- [ ] **Step 2: 部署 + 提交**

```bash
npx tcb fn deploy preset/list -e mae-dev-xxxx
git add cloudfunctions/preset/
git commit -m "feat(preset): list 云函数（小程序生成页调用）"
```

---

### Task 24: generate.submit + generate.worker

**Files:**
- Create: `cloudfunctions/generate/submit/index.js`, `cloudfunctions/generate/worker/index.js`, `cloudfunctions/generate/worker/config.json`（DB stream 触发器）

- [ ] **Step 1: submit 云函数**

```javascript
// cloudfunctions/generate/submit/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
const { check } = require('../../_shared/services/ratelimiter');
const { consume } = require('../../_shared/services/creditledger');
const { checkImage } = require('../../_shared/services/imageaudit');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  const { fileid, preset_keys = [], prompt = '' } = event;
  if (!fileid) return fail(CODES.NOT_FOUND, '缺少 fileid');
  if (!Array.isArray(preset_keys) || preset_keys.length === 0) return fail(CODES.NOT_FOUND, '请至少选 1 个预设项目');
  if (preset_keys.length > 10) return fail(CODES.NOT_FOUND, '最多选 10 项');

  // 1. 图片审核
  const url = (await cloud.getTempFileURL({ fileList: [fileid] })).fileList[0].tempFileURL;
  const audit = await checkImage(url);
  if (!audit.pass) return fail(CODES.FORBIDDEN, '图片违规');

  // 2. 限流
  const rlCfg = (await cloud.database().collection('system_configs').doc('rate_limit').get()).data.value;
  const rl = await check(ctx.userId, rlCfg);
  if (!rl.allowed) return fail(CODES.RATE_LIMITED, '操作太频繁，请稍后再试');

  // 3. 计算积分（查 system_configs.credit_pricing_table）
  const pricing = (await cloud.database().collection('system_configs').doc('credit_pricing_table').get()).data.value;
  const n = preset_keys.length;
  const tier = pricing.find(p => p.items === Math.min(n, pricing[pricing.length - 1].items));
  const cost = tier.cost;

  // 4. 查 preset 详情
  const presetRes = await cloud.database().collection('preset_items')
    .where({ key: cloud.database().command.in(preset_keys), is_active: true }).get();
  if (presetRes.data.length !== preset_keys.length) return fail(CODES.NOT_FOUND, '部分预设项目不存在');

  // 5. 扣积分（事务）
  const genId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await consume({ userId: ctx.userId, amount: cost, relatedId: genId, note: 'AI 生成扣减' });

  // 6. 写 generation pending
  await cloud.database().collection('generations').add({
    _id: genId,
    user_id: ctx.userId,
    openid: ctx.openid,
    original_fileid: fileid,
    preset_keys,
    prompt_text: prompt,
    credits_cost: cost,
    status: 'pending',
    created_at: new Date(),
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });

  return ok({ generation_id: genId, cost });
});
```

- [ ] **Step 2: 配置 worker 的 DB stream 触发器**

```json
// cloudfunctions/generate/worker/config.json
{
  "triggers": [{
    "name": "onPendingGen",
    "type": "database",
    "config": {
      "collection": "generations",
      "action": "insert",
      "filters": [{ "field": "status", "operator": "=", "value": "pending" }]
    }
  }]
}
```

- [ ] **Step 3: worker 云函数**

```javascript
// cloudfunctions/generate/worker/index.js
const cloud = require('wx-server-sdk');
const { dispense } = require('../../_shared/services/aiservice');
const { getTempUrl, uploadBuffer, deleteFiles } = require('../../_shared/services/imagestorage');
const { refund } = require('../../_shared/services/creditledger');
const { log: auditLog } = require('../../_shared/services/auditlog');
const { sendGenerationResult } = require('../../_shared/services/subscribemsg');
const { error: logError } = require('../../_shared/utils/logger');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 简易 image composition：用云存储的 uploadFile + 浏览器端的 canvas 合成更方便，
// 此处 v1 用 sharp 库在 worker 内合成水印
const sharp = require('sharp');

exports.main = withErrorHandler(async (event) => {
  // DB stream 触发：event.data 是新写入的文档
  const gen = event.data;
  if (!gen || gen.status !== 'pending') return { ok: true, skip: true };

  const start = Date.now();
  let model = 'unknown', success = false, errorCode = null, errorMsg = null;
  try {
    // 1. 拿原图
    const origUrl = (await getTempUrl(gen.original_fileid))[0];  // 临时签名 URL

    // 2. 查 preset 详情
    const presetsRes = await cloud.database().collection('preset_items')
      .where({ key: cloud.database().command.in(gen.preset_keys) }).get();

    // 3. 调 AI
    const r = await dispense({
      imageUrl: origUrl,
      presets: presetsRes.data,
      userText: gen.prompt_text,
      userId: gen.user_id,
      generationId: gen._id,
    });
    model = r.vendorMeta?.vendor || (await getModelFromConfig());

    // 4. 下载 AI 结果 + 加 AI 角标水印
    const axios = require('axios');
    const buf = (await axios.get(r.resultUrl, { responseType: 'arraybuffer' })).data;
    const watermarked = await sharp(buf)
      .composite([{
        input: Buffer.from(makeWatermarkSvg()),
        gravity: 'southeast',
      }])
      .toBuffer();
    const upload = await uploadBuffer(watermarked, `generations/${gen._id}.jpg`);

    // 5. 更新 generation
    await cloud.database().collection('generations').doc(gen._id).update({
      data: {
        status: 'success',
        result_fileid: upload.fileID,
        model_used: model,
        completed_at: new Date(),
      },
    });
    success = true;
  } catch (e) {
    logError('worker failed', { genId: gen._id, err: e.message });
    errorCode = e.code;
    errorMsg = e.message;
    // 退积分
    try {
      await refund({ userId: gen.user_id, amount: gen.credits_cost, relatedId: gen._id, note: 'AI 失败自动退款' });
    } catch (refundErr) {
      logError('refund failed', { genId: gen._id, err: refundErr.message });
    }
    await cloud.database().collection('generations').doc(gen._id).update({
      data: { status: 'failed', error_msg: errorMsg, completed_at: new Date() },
    });
  } finally {
    await auditLog({
      user_id: gen.user_id,
      generation_id: gen._id,
      model,
      latency_ms: Date.now() - start,
      success,
      error_code: errorCode,
    });
  }

  // 6. 发订阅消息
  try {
    await sendGenerationResult({
      openid: gen.openid,
      generationId: gen._id,
      success,
      errorMsg,
    });
  } catch (e) {
    logError('subscribe send failed', { genId: gen._id, err: e.message });
  }
  return { ok: true };
});

function makeWatermarkSvg() {
  return `<svg width="200" height="60" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="60" fill="rgba(0,0,0,0.4)" rx="4"/>
    <text x="10" y="22" fill="white" font-family="Arial" font-size="14" font-weight="bold">AI 模拟预览</text>
    <text x="10" y="44" fill="white" font-family="Arial" font-size="10">仅供娱乐参考，不构成医疗建议</text>
  </svg>`;
}
```

- [ ] **Step 4: 部署 submit + worker + 在小程序后台申请订阅消息模板**

- [ ] **Step 5: 端到端测试**
  - 上传图 → 选预设 → 提交 → 立即返回 generation_id
  - 30s 内应收到订阅消息
  - 点进 → 看到结果图（带水印）
  - DB: generations.status=success, users.credits 减少

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/generate/
git commit -m "feat(generate): submit + worker（异步、AI 集成、订阅消息）"
```

---

### Task 25: generate.status / list / detail / delete / downloadUrl

**Files:** 5 个云函数

- [ ] **Step 1: 实现 status（供用户主动查）**

```javascript
// cloudfunctions/generate/status/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
const { resolveContext } = require('../../_shared/middlewares/auth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  const ctx = await resolveContext(event, {});
  if (!event.id) return fail(CODES.NOT_FOUND, '缺少 id');
  const r = await cloud.database().collection('generations').doc(event.id).get();
  if (!r.data || r.data.user_id !== ctx.userId) return fail(CODES.NOT_FOUND, '记录不存在');
  return ok({
    id: r.data._id,
    status: r.data.status,
    result_fileid: r.data.result_fileid,
    error_msg: r.data.error_msg,
    created_at: r.data.created_at,
    expires_at: r.data.expires_at,
  });
});
```

- [ ] **Step 2: 实现 list / detail / delete / downloadUrl（结构相似，此处略）**

> **实现要点**：
> - `list`：分页 + 缩略图临时 URL
> - `detail`：单条 + 原图/结果图临时 URL
> - `delete`：db.delete + cloud.deleteFile
> - `downloadUrl`：写 download_logs + 返回临时签名 URL（1 小时过期）

- [ ] **Step 3: 部署 + 提交**

```bash
npx tcb fn deploy generate/{status,list,detail,delete,downloadUrl} -e mae-dev-xxxx
git add cloudfunctions/generate/
git commit -m "feat(generate): status/list/detail/delete/downloadUrl"
```

---

### Task 26: 阶段 3 验收

- [ ] **Step 1: E2E 手测**
  - 登录 → 充值 → 提交生成 → 收到订阅消息 → 查看结果
  - 触发失败（临时把 primary 改 mock 失败）→ 自动退积分

- [ ] **Step 2: 提交 + tag**

```bash
git tag p3-ai-integration
git push --tags
```

---

## 5. 阶段 4（P4）：咨询师端页面（W7-W8）

### Task 27: 工作台 + 生成 + 生成中 + 结果

**Files:**
- Create: 4 个页面

> 复用 Task 16 已搭好的工具，UI 套用规范（7.3）。每个页面 ~100 行 JS + ~80 行 WXML + ~50 行 WXSS。此处给出 JS 关键逻辑。

- [ ] **Step 1: 工作台**

```javascript
// miniprogram/pages/dashboard/index.js
const { callFn } = require('../../utils/api');
Page({
  data: { user: null, credits: 0, recent: [] },
  onShow() { this.refresh(); },
  async refresh() {
    const user = await callFn('user/profile');
    const recent = await callFn('generate/list', { page: 1 });
    this.setData({ user, credits: user.credits, recent: recent.generations.slice(0, 6) });
  },
  onTapUpload() { wx.navigateTo({ url: '/pages/generate/index' }); },
  onTapRecharge() { wx.navigateTo({ url: '/pages/recharge/index' }); },
  onTapHistory() { wx.switchTab({ url: '/pages/history/index' }); },
  onTapProfile() { wx.switchTab({ url: '/pages/profile/index' }); },
  onTapRecent(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/result/index?id=${id}` });
  },
});
```

- [ ] **Step 2: 生成页（核心）**

```javascript
// miniprogram/pages/generate/index.js
const { callFn } = require('../../utils/api');
Page({
  data: {
    imageUrl: '', fileid: '',
    presets: [], selected: new Set(), categories: [],
    userText: '', cost: 0, submitting: false,
  },
  onLoad() { this.loadPresets(); },
  async loadPresets() {
    const data = await callFn('preset/list');
    this.setData({
      presets: data.items,
      categories: data.categories,
    });
  },
  onChooseImage() {
    wx.chooseMedia({
      count: 1, mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    }).then(async (res) => {
      const file = res.tempFiles[0];
      const upload = await wx.cloud.uploadFile({
        cloudPath: `uploads/${Date.now()}.jpg`,
        filePath: file.tempFilePath,
      });
      this.setData({ imageUrl: file.tempFilePath, fileid: upload.fileID });
    });
  },
  togglePreset(e) {
    const key = e.currentTarget.dataset.key;
    const s = new Set(this.data.selected);
    s.has(key) ? s.delete(key) : s.add(key);
    if (s.size > 10) { wx.showToast({ title: '最多 10 项', icon: 'none' }); return; }
    const cost = computeCost(s.size);
    this.setData({ selected: s, cost });
  },
  onInput(e) { this.setData({ userText: e.detail.value }); },
  async onSubmit() {
    if (!this.data.fileid) return wx.showToast({ title: '请先上传照片', icon: 'none' });
    if (this.data.selected.size === 0) return wx.showToast({ title: '请选择项目', icon: 'none' });
    // 订阅消息授权
    await wx.requestSubscribeMessage({ tmplIds: [getApp().globalData.subscribeTmplId] });
    this.setData({ submitting: true });
    try {
      const r = await callFn('generate/submit', {
        fileid: this.data.fileid,
        preset_keys: [...this.data.selected],
        prompt: this.data.userText,
      });
      wx.redirectTo({ url: `/pages/generating/index?id=${r.generation_id}` });
    } catch (e) { wx.showToast({ title: e.message, icon: 'none' }); }
    finally { this.setData({ submitting: false }); }
  },
});

function computeCost(n) {
  const table = [{ items: 1, cost: 2 }, { items: 2, cost: 3 }, { items: 3, cost: 4 }, { items: 4, cost: 5 }];
  const t = table.find(x => x.items === Math.min(n, 4)) || { cost: 5 };
  return t.cost;
}
```

- [ ] **Step 3: 生成中页（提示 + 取消）**

```javascript
// miniprogram/pages/generating/index.js
const { callFn } = require('../../utils/api');
Page({
  data: { id: '', status: 'pending' },
  onLoad(opts) { this.setData({ id: opts.id }); this.startPolling(); },
  onUnload() { this.stopPolling(); },
  startPolling() {
    this.timer = setInterval(async () => {
      const r = await callFn('generate/status', { id: this.data.id });
      this.setData({ status: r.status });
      if (r.status === 'success') {
        this.stopPolling();
        setTimeout(() => wx.redirectTo({ url: `/pages/result/index?id=${this.data.id}` }), 800);
      } else if (r.status === 'failed') {
        this.stopPolling();
        wx.showModal({ title: '生成失败', content: r.error_msg || '请稍后重试', showCancel: false });
      }
    }, 3000);
  },
  stopPolling() { if (this.timer) clearInterval(this.timer); },
  onTapBack() { wx.switchTab({ url: '/pages/dashboard/index' }); },
});
```

> 订阅消息触发后用户回到此页可立刻跳转，无需等轮询

- [ ] **Step 4: 结果页（左右滑对比）**

```javascript
// miniprogram/pages/result/index.js
const { callFn } = require('../../utils/api');
Page({
  data: { id: '', detail: null, sliderValue: 50 },
  onLoad(opts) { this.setData({ id: opts.id }); this.load(); },
  async load() {
    const r = await callFn('generate/detail', { id: this.data.id });
    this.setData({ detail: r.generation });
  },
  onSlide(e) { this.setData({ sliderValue: e.detail.value }); },
  onDownload() { wx.showToast({ title: '请长按图片保存', icon: 'none' }); },
  onDelete() {
    wx.showModal({ title: '确认删除？', success: async (res) => {
      if (res.confirm) {
        await callFn('generate/delete', { id: this.data.id });
        wx.navigateBack();
      }
    }});
  },
});
```

```xml
<!-- miniprogram/pages/result/index.wxml -->
<view class="container">
  <view class="compare" wx:if="{{detail.result_fileid}}">
    <image src="{{detail.result_fileid}}" mode="aspectFit" class="img-bg" />
    <view class="img-top" style="width:{{sliderValue}}%; overflow:hidden">
      <image src="{{detail.original_fileid}}" mode="aspectFill" class="img" />
    </view>
    <view class="slider" style="left:{{sliderValue}}%"></view>
  </view>
  <slider value="{{sliderValue}}" bindchanging="onSlide" min="0" max="100" activeColor="#d4a5a0" block-size="20" />
  <view class="actions">
    <button bindtap="onDownload">保存到相册</button>
    <button bindtap="onDelete" class="danger">删除</button>
  </view>
</view>
```

- [ ] **Step 5: 部署小程序 + 在开发者工具里完整走一遍"上传 → 选项目 → 提交 → 订阅通知 → 看结果"**

- [ ] **Step 6: 提交**

```bash
git add miniprogram/pages/dashboard miniprogram/pages/generate miniprogram/pages/generating miniprogram/pages/result
git commit -m "feat(miniprogram): 工作台/生成/生成中/结果 4 页"
```

---

### Task 28: 历史 + 订单详情（完善）

**Files:**
- Create: 2 个页面

- [ ] **Step 1: 历史页**

```javascript
// miniprogram/pages/history/index.js
const { callFn } = require('../../utils/api');
Page({
  data: { list: [], page: 1, hasMore: true, loading: false },
  onShow() { this.refresh(); },
  async refresh() {
    this.setData({ page: 1, hasMore: true });
    await this.load();
  },
  async load() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });
    const r = await callFn('generate/list', { page: this.data.page });
    this.setData({
      list: this.data.page === 1 ? r.generations : this.data.list.concat(r.generations),
      page: this.data.page + 1,
      hasMore: r.has_more,
      loading: false,
    });
  },
  onReachBottom() { this.load(); },
  onTapItem(e) {
    wx.navigateTo({ url: `/pages/result/index?id=${e.currentTarget.dataset.id}` });
  },
});
```

- [ ] **Step 2: 订单详情页**

```javascript
// miniprogram/pages/order-detail/index.js
const { callFn } = require('../../utils/api');
Page({
  data: { order: null },
  onLoad(opts) {
    callFn('order/detail', { order_no: opts.order_no }).then(r => this.setData({ order: r.order }));
  },
});
```

- [ ] **Step 3: 提交 + 部署**

```bash
git add miniprogram/pages/history miniprogram/pages/order-detail
git commit -m "feat(miniprogram): 历史 + 订单详情"
```

---

### Task 29: 阶段 4 验收（**v1 可对外发布**）

- [ ] **Step 1: 完整用户旅程测试**
  - 注册 → 充值 → 生成 → 查看结果 → 下载
  - 查历史 → 删记录 → 注销

- [ ] **Step 2: 性能 smoke test**
  - 10 个并发生成 → 全部成功 / 积分扣对 / AI 角标全有

- [ ] **Step 3: 体验版发布到 20 个内部测试账号**

```bash
git tag v0.1.0-internal
git push --tags
```

---

## 6. 阶段 5（P5）：运营后台 + 合规 + 测试 + 上线（W9-W12）

### Task 30: 运营后台 H5 脚手架

**Files:** Vue 3 + Vite + Element Plus 初始化

- [ ] **Step 1: 初始化 admin H5**

```bash
cd admin
npm create vite@latest . -- --template vue
npm install element-plus pinia vue-router
```

- [ ] **Step 2: 写 main.js + router**

```javascript
// admin/src/main.js
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import router from './router';
import App from './App.vue';

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app');
```

```javascript
// admin/src/router.js
import { createRouter, createWebHistory } from 'vue-router';
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: () => import('./pages/Login.vue') },
    { path: '/', component: () => import('./pages/Dashboard.vue'), meta: { auth: true } },
    { path: '/orders', component: () => import('./pages/Orders.vue'), meta: { auth: true } },
    { path: '/users', component: () => import('./pages/Users.vue'), meta: { auth: true } },
    { path: '/presets', component: () => import('./pages/Presets.vue'), meta: { auth: true } },
    { path: '/packages', component: () => import('./pages/Packages.vue'), meta: { auth: true } },
    { path: '/configs', component: () => import('./pages/Configs.vue'), meta: { auth: true } },
    { path: '/ai-logs', component: () => import('./pages/AILogs.vue'), meta: { auth: true } },
    { path: '/audit-log', component: () => import('./pages/AuditLog.vue'), meta: { auth: true } },
  ],
});

router.beforeEach((to) => {
  if (to.meta.auth && !localStorage.getItem('admin_token')) return '/login';
});
export default router;
```

- [ ] **Step 3: 写 api 封装**

```javascript
// admin/src/api/index.js
// 调用 admin 云函数（需先在云开发控制台为运营后台分配一个固定 openid 或 IP 白名单）
// 简化方案：先在 user.login 走 wx.login 拿 openid，但运营后台是 H5，没有 wx.login
// 折中：运营后台用 admin_users 表的 username/password → admin.login 返回 JWT → 后续请求 header 带 token

const BASE = '';  // admin 云函数可在 HTTP 触发器下用 https://{env}.tcloudbase.com/admin/{fn}
async function callFn(name, data = {}) {
  const token = localStorage.getItem('admin_token');
  const res = await fetch(`${BASE}/admin/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Token': token },
    body: JSON.stringify(data),
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(j.message);
  return j.data;
}
export default callFn;
```

> **v1 实施细节**：H5 调用云函数需要 HTTP 触发器，并且 admin 云函数要开 HTTP 触发。详细配置在 Task 31。

- [ ] **Step 4: 部署到云开发静态托管**

```bash
npm run build
npx tcb hosting deploy ./dist -e mae-dev-xxxx
```

- [ ] **Step 5: 提交**

```bash
git add admin/
git commit -m "feat(admin): H5 脚手架（Vue3 + Vite + Element Plus）"
```

---

### Task 31: admin.login + 鉴权 + 强制改密

**Files:**
- Create: `cloudfunctions/admin/login/index.js`, `admin/login/config.json`
- Create: `admin/src/pages/Login.vue`

- [ ] **Step 1: login 云函数**

```javascript
// cloudfunctions/admin/login/index.js
const cloud = require('wx-server-sdk');
const bcrypt = require('bcryptjs');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { sign } = require('../../_shared/utils/jwt');
const { withErrorHandler } = require('../../_shared/middlewares/errorHandler');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const INITIAL_PASSWORD_HASH = process.env.ADMIN_INITIAL_PW_HASH;  // bcrypt 哈希

exports.main = withErrorHandler(async (event) => {
  const { username, password } = event;
  if (!username || !password) return fail(CODES.NOT_FOUND, '缺少账号密码');

  const db = cloud.database();
  if (username === 'admin' && INITIAL_PASSWORD_HASH) {
    // 首次使用：用户名=admin，密码=INITIAL_PASSWORD_HASH
    const ok_ = await bcrypt.compare(password, INITIAL_PASSWORD_HASH);
    if (!ok_) return fail(CODES.FORBIDDEN, '账号或密码错误');
    const token = sign({ sub: 'admin', role: 'super' }, '8h');
    return ok({ token, admin: { username: 'admin', role: 'super', first_login: !await hasAdminRecord() } });
  }

  const r = await db.collection('admin_users').where({ username }).limit(1).get();
  const admin = r.data[0];
  if (!admin) return fail(CODES.FORBIDDEN, '账号或密码错误');
  if (await bcrypt.compare(password, admin.password_hash)) {
    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      return fail(CODES.FORBIDDEN, '账号已锁定，请稍后再试');
    }
    const token = sign({ sub: admin._id, role: admin.role }, '8h');
    return ok({ token, admin: { username: admin.username, role: admin.role } });
  } else {
    await incFailedAttempts(admin);
    return fail(CODES.FORBIDDEN, '账号或密码错误');
  }
});

async function hasAdminRecord() {
  const r = await cloud.database().collection('admin_users').count();
  return r.total > 0;
}
async function incFailedAttempts(admin) { /* 实现锁定逻辑，5 次锁 30 分钟 */ }
```

- [ ] **Step 2: 配置 HTTP 触发**

```json
// cloudfunctions/admin/login/config.json
{ "triggers": [{ "name": "adminLogin", "type": "http", "config": { "method": "POST", "path": "/admin/login" } }] }
```

- [ ] **Step 3: 写 Login.vue（Vue 组件）**

```vue
<template>
  <el-form :model="form" @submit.prevent="onLogin">
    <el-form-item label="用户名">
      <el-input v-model="form.username" />
    </el-form-item>
    <el-form-item label="密码">
      <el-input v-model="form.password" type="password" />
    </el-form-item>
    <el-button type="primary" :loading="loading" @click="onLogin">登录</el-button>
  </el-form>
</template>
<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import callFn from '../api';
const router = useRouter();
const form = ref({ username: '', password: '' });
const loading = ref(false);
async function onLogin() {
  loading.value = true;
  try {
    const r = await callFn('login', form.value);
    localStorage.setItem('admin_token', r.token);
    router.push('/');
  } catch (e) { alert(e.message); }
  finally { loading.value = false; }
}
</script>
```

- [ ] **Step 4: 部署 + 提交**

```bash
git add cloudfunctions/admin/login/ admin/src/pages/Login.vue
git commit -m "feat(admin): login（HTTP 触发）+ H5 登录页"
```

---

### Task 32: 运营后台 8 个模块（dashboard / orders / users / presets / packages / configs / ai-logs / audit-log）

**Files:** 8 个 Vue 页面 + 8 个对应 admin 云函数

> 各模块页面结构相似，此处给出 Dashboard 和 Presets 的代码示例；其余 Orders/Users/Packages/Configs/AILogs/AuditLog 实现模式相同（列表 + 详情 + 操作弹窗）。

- [ ] **Step 1: Dashboard 云函数**

```javascript
// cloudfunctions/admin/dashboard/index.js
const cloud = require('wx-server-sdk');
const { ok } = require('../../_shared/utils/response');
const { withErrorHandler, requireAdmin } = require('../../_shared/middlewares/adminAuth');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = withErrorHandler(async (event) => {
  await requireAdmin(event);
  const db = cloud.database();
  const _ = db.command;
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [orderCount, paidAgg, userCount, aiCount, pendingRefunds] = await Promise.all([
    db.collection('orders').where({ created_at: _.gte(today) }).count(),
    db.collection('orders').where({ status: 'paid', paid_at: _.gte(today) }).get(),
    db.collection('users').where({ created_at: _.gte(today) }).count(),
    db.collection('ai_call_logs').where({ created_at: _.gte(today) }).count(),
    db.collection('refunds').where({ status: 'pending' }).limit(10).get(),
  ]);

  return ok({
    kpi: {
      orders: orderCount.total,
      revenue_cents: paidAgg.data.reduce((s, o) => s + o.amount_cents, 0),
      new_users: userCount.total,
      ai_calls: aiCount.total,
    },
    pending: pendingRefunds.data,
  });
});
```

- [ ] **Step 2: Dashboard.vue**

```vue
<template>
  <div class="dashboard">
    <el-row :gutter="16">
      <el-col :span="6"><el-card><div class="kpi">📦 今日订单</div><div class="num">{{ kpi.orders }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div class="kpi">💰 今日收入</div><div class="num">¥{{ (kpi.revenue_cents/100).toFixed(0) }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div class="kpi">👤 新增用户</div><div class="num">{{ kpi.new_users }}</div></el-card></el-col>
      <el-col :span="6"><el-card><div class="kpi">🤖 AI 调用</div><div class="num">{{ kpi.ai_calls }}</div></el-card></el-col>
    </el-row>
  </div>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import callFn from '../api';
const kpi = ref({ orders: 0, revenue_cents: 0, new_users: 0, ai_calls: 0 });
onMounted(async () => { kpi.value = (await callFn('dashboard')).kpi; });
</script>
```

- [ ] **Step 3: Presets 模块（CRUD 完整示例）**

```javascript
// cloudfunctions/admin/presets/index.js
const cloud = require('wx-server-sdk');
const { ok, fail, CODES } = require('../../_shared/utils/response');
const { withErrorHandler, requireAdmin } = require('../../_shared/middlewares/adminAuth');
const { validate } = require('../../_shared/utils/validator');
const { z } = require('zod');
const { writeLog } = require('../../_shared/utils/audit');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const presetSchema = z.object({
  key: z.string().regex(/^[a-z_]+$/),
  category: z.string(),
  name: z.string().max(20),
  description: z.string().max(200),
  default_prompt: z.string().min(10),
  credits_cost: z.number().int().min(1).max(10),
  is_active: z.boolean(),
  sort_order: z.number().int(),
});

exports.main = withErrorHandler(async (event) => {
  const admin = await requireAdmin(event);
  const db = cloud.database();
  const { httpMethod, _id, ...data } = event;

  switch (httpMethod) {
    case 'GET': {
      const r = await db.collection('preset_items').orderBy('sort_order', 'asc').get();
      return ok({ presets: r.data });
    }
    case 'POST': {
      const p = presetSchema.parse(data);
      const r = await db.collection('preset_items').add({ ...p, created_at: new Date() });
      await writeLog(admin.adminId, 'preset.create', r.id);
      return ok({ id: r.id });
    }
    case 'PUT': {
      if (!_id) return fail(CODES.NOT_FOUND, '缺少 _id');
      const p = presetSchema.partial().parse(data);
      await db.collection('preset_items').doc(_id).update({ data: p });
      await writeLog(admin.adminId, 'preset.update', _id);
      return ok({ updated: true });
    }
    case 'DELETE': {
      if (!_id) return fail(CODES.NOT_FOUND, '缺少 _id');
      await db.collection('preset_items').doc(_id).remove();
      await writeLog(admin.adminId, 'preset.delete', _id);
      return ok({ deleted: true });
    }
    default: return fail(CODES.NOT_FOUND, '不支持的方法');
  }
});
```

```vue
<!-- admin/src/pages/Presets.vue -->
<template>
  <el-button @click="onAdd">新增</el-button>
  <el-table :data="presets">
    <el-table-column prop="key" label="key" />
    <el-table-column prop="category" label="分类" />
    <el-table-column prop="name" label="名称" />
    <el-table-column prop="credits_cost" label="积分" />
    <el-table-column label="启用">
      <template #default="{ row }">
        <el-switch v-model="row.is_active" @change="onToggle(row)" />
      </template>
    </el-table-column>
    <el-table-column label="操作">
      <template #default="{ row }">
        <el-button @click="onEdit(row)">编辑</el-button>
        <el-button type="danger" @click="onDelete(row)">删除</el-button>
      </template>
    </el-table-column>
  </el-table>

  <el-dialog v-model="dialogVisible" :title="form._id ? '编辑' : '新增'">
    <el-form :model="form">
      <el-form-item label="key"><el-input v-model="form.key" :disabled="!!form._id" /></el-form-item>
      <el-form-item label="分类"><el-input v-model="form.category" /></el-form-item>
      <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="描述"><el-input v-model="form.description" /></el-form-item>
      <el-form-item label="默认提示词"><el-input v-model="form.default_prompt" type="textarea" /></el-form-item>
      <el-form-item label="积分"><el-input-number v-model="form.credits_cost" :min="1" :max="10" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="form.sort_order" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import callFn from '../api';
const presets = ref([]);
const dialogVisible = ref(false);
const form = ref({});
async function load() { presets.value = (await callFn('presets')).presets; }
function onAdd() { form.value = { credits_cost: 2, sort_order: 999, is_active: true }; dialogVisible.value = true; }
function onEdit(row) { form.value = { ...row }; dialogVisible.value = true; }
async function onSave() {
  if (form.value._id) await callFn('presets', { httpMethod: 'PUT', _id: form.value._id, ...form.value });
  else await callFn('presets', { httpMethod: 'POST', ...form.value });
  ElMessage.success('已保存'); dialogVisible.value = false; load();
}
async function onDelete(row) {
  await ElMessageBox.confirm(`删除 ${row.name}？`, '确认');
  await callFn('presets', { httpMethod: 'DELETE', _id: row._id });
  ElMessage.success('已删除'); load();
}
async function onToggle(row) {
  await callFn('presets', { httpMethod: 'PUT', _id: row._id, is_active: row.is_active });
  ElMessage.success('已更新');
}
onMounted(load);
</script>
```

- [ ] **Step 4: 其余 6 个模块按此模式实现（页面 + 云函数）**

具体模块功能参考 7.2 节表格。**每个模块的云函数 ~50 行 JS，Vue 页面 ~80 行模板 + 60 行脚本**。

- [ ] **Step 5: 部署 + 在浏览器中跑通所有 CRUD**

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/admin/ admin/src/pages/
git commit -m "feat(admin): dashboard/orders/users/presets/packages/configs/ailogs/auditlog 全模块"
```

---

### Task 33: cron 函数（3 个）

**Files:**
- Create: `cloudfunctions/cron/expireGenerations/index.js`, `dailyReconcile/index.js`, `cleanupOrphanFiles/index.js`
- Create: 3 个 `config.json`（定时触发器）

- [ ] **Step 1: expireGenerations**

```javascript
// cloudfunctions/cron/expireGenerations/index.js
const cloud = require('wx-server-sdk');
const { deleteFiles } = require('../../_shared/services/imagestorage');
const { info } = require('../../_shared/utils/logger');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const db = cloud.database();
  const now = new Date();
  const r = await db.collection('generations').where({
    status: 'success',
    expires_at: db.command.lt(now),
  }).limit(100).get();

  const fileids = r.data.flatMap(g => [g.original_fileid, g.result_fileid].filter(Boolean));
  if (fileids.length) await deleteFiles(fileids);
  for (const g of r.data) {
    await db.collection('generations').doc(g._id).update({ data: { status: 'expired' } });
  }
  info('expireGenerations done', { count: r.data.length });
  return { expired: r.data.length };
};
```

```json
// cloudfunctions/cron/expireGenerations/config.json
{ "triggers": [{ "name": "expireDaily", "type": "timer", "config": { "cron": "0 3 * * * *" } }] }
```

- [ ] **Step 2: dailyReconcile**

```javascript
// cloudfunctions/cron/dailyReconcile/index.js
const cloud = require('wx-server-sdk');
const { error: logError } = require('../../_shared/utils/logger');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const db = cloud.database();
  // 抽查最近 1000 个用户的余额与流水账是否一致
  const users = await db.collection('users').limit(1000).get();
  let mismatch = 0;
  for (const u of users.data) {
    const r = await db.collection('credit_ledger').where({ user_id: u._id }).get();
    const sum = r.data.reduce((s, l) => s + l.amount, 0);
    if (sum !== (u.credits || 0)) {
      mismatch++;
      logError('credit mismatch', { userId: u._id, credits: u.credits, ledgerSum: sum });
    }
  }
  if (mismatch > 0) {
    // 触发告警（v1 用 console 即可，v2 接企业微信 webhook）
    logError('daily reconcile found mismatches', { count: mismatch });
  }
  return { checked: users.data.length, mismatches: mismatch };
};
```

- [ ] **Step 3: cleanupOrphanFiles**

```javascript
// cloudfunctions/cron/cleanupOrphanFiles/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  // 列出云存储 uploads/ 和 generations/ 目录的所有文件
  // 对比 DB 中所有 generations 引用，删未引用的
  // 简单实现：用 cloud.getTempFileURL 列不动，需用 cloud.deleteFile 删已确认的孤儿
  // v1 实现略，可写一个 "用户主动报" 的入口代替
  return { ok: true, note: 'v1 noop, will be implemented in v1.1' };
};
```

- [ ] **Step 4: 部署 + 提交**

```bash
git add cloudfunctions/cron/
git commit -m "feat(cron): expireGenerations/dailyReconcile/cleanupOrphanFiles"
```

---

### Task 34: E2E 测试（miniprogram-automator）

**Files:**
- Create: `tests/e2e/setup.js`, `tests/e2e/flows/login.test.js`, `tests/e2e/flows/recharge.test.js`, `tests/e2e/flows/generate.test.js`

- [ ] **Step 1: 安装**

```bash
npm install --save-dev miniprogram-automator
```

- [ ] **Step 2: 写 setup + 第一个 flow**

```javascript
// tests/e2e/setup.js
const automator = require('miniprogram-automator');

async function launch() {
  const mini = await automator.launch({
    projectPath: '/home/ubuntu/personal_work/miniprogram',
    cliPath: '/path/to/wechat/devtools/cli',  // 微信开发者工具 CLI
  });
  await mini.waitFor(2000);
  return mini;
}

module.exports = { launch };
```

```javascript
// tests/e2e/flows/login.test.js
const { launch } = require('../setup');

describe('login flow', () => {
  let mini;
  beforeAll(async () => { mini = await launch(); });
  afterAll(async () => { if (mini) await mini.close(); });

  test('user can login via wx', async () => {
    const page = await mini.switchTab('/pages/login/index');
    // ...automator API 点按钮 + 断言
  }, 60000);
});
```

- [ ] **Step 3: 跑 4 个主流程测试**

```bash
npx jest tests/e2e --runInBand
```

- [ ] **Step 4: 提交**

```bash
git add tests/e2e/
git commit -m "test(e2e): miniprogram-automator + 4 主流程"
```

---

### Task 35: 合规 checklist + 协议内容

- [ ] **Step 1: 隐私政策 / 用户协议 文本**

由陈工（或律师）撰写真实文本，写入 `system_configs.protocols.{user,privacy}.content`（生产环境）。

- [ ] **Step 2: 合规 checklist 跑一遍**

```
[ ] 协议首次访问强制弹 ✓
[ ] 用户可随时查看协议 ✓
[ ] 用户可注销账号（30 天后清数据）✓
[ ] AI 生成图有水印 ✓
[ ] AI 生成图有 "AI 生成" 角标 ✓
[ ] 页面有免责说明 ✓
[ ] 用户协议写"非医疗行为" ✓
[ ] 算法备案完成（陈工公司主体）✓
[ ] 商户号类目正确（医疗 > 医疗美容服务）✓
```

- [ ] **Step 3: 提交**

```bash
git commit -m "docs: 合规 checklist 通过"
```

---

### Task 36: 监控 + 告警

- [ ] **Step 1: 在云开发控制台开通告警**

```
错误率 > 5% → 通知
AI 失败率 > 15% → 通知 + 切备
余额 < ¥100 → 通知
```

- [ ] **Step 2: 微信群机器人（webhook）**

```javascript
// 在 _shared/utils/ 添加 notifyWechat.js
async function notifyWechat(text) {
  const webhook = process.env.WECHAT_BOT_WEBHOOK;
  if (!webhook) return;
  await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'text', text: { content: text } }),
  });
}
```

在各关键错误分支调用（已在 worker 失败等场景加入）。

- [ ] **Step 3: 提交**

```bash
git add cloudfunctions/_shared/utils/notifyWechat.js
git commit -m "feat(monitor): 微信群机器人告警"
```

---

### Task 37: 算法备案 + 小程序提审

- [ ] **Step 1: 算法备案（陈工公司主体）**
  - 在网信办"互联网信息服务算法备案系统"注册
  - 提交：算法说明、安全评估、语料来源、模型类型等
  - 周期：~1 个月

- [ ] **Step 2: 微信小程序提交审核**

```bash
# 在 CI 中：
npx miniprogram-ci upload \
  --pp ./miniprogram/project.config.json \
  --pkp ${{ secrets.MINI_PROGRAM_PRIVATE_KEY }} \
  --appid ${{ secrets.MINI_PROGRAM_APPID }} \
  --uv v1.0.0
```

- [ ] **Step 3: 在微信小程序后台填写体验版 → 提交审核**

- [ ] **Step 4: 灰度 20 个测试账号**

- [ ] **Step 5: 收集反馈 + 修 bug**

---

### Task 38: 正式发布

- [ ] **Step 1: 切到生产环境（替换 system_configs / AI key）**

```bash
# 在云开发控制台 → 切换环境到 prod → 重新跑迁移
npx tcb fn run admin/_initDb -e mae-prod-xxxx
```

- [ ] **Step 2: 监控 + 告警全部就位**

- [ ] **Step 3: 小程序审核通过 → 正式发布**

- [ ] **Step 4: 打 v1.0.0 tag**

```bash
git tag v1.0.0
git push --tags
```

- [ ] **Step 5: 30 天后看 v1 成功标准（13.3 节）**

---

## 7. 后续（v1.1+）

不在本计划范围，但记下未来方向：
- v1.1：邀请返积分、批量下载
- v1.2：抖音/小红书 KOL 投放
- v1.3：机构 BD 后台
- v2.0：完整等保认证、H5 分享页、原生 APP

---

*本计划结束。*
