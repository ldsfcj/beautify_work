# 项目框架状态

> **生成日期**：2026-06-04
> **状态**：✅ 框架就绪（占位符版本）

---

## 已完成

| 内容 | 状态 | commit |
|---|---|---|
| git 仓库初始化 | ✅ | `6f5b598` |
| 根目录配置（.gitignore / package.json / README / miniprogram/app.json / project.config.json） | ✅ | `6f5b598` |
| **目录结构**（80+ 个目录） | ✅ | 见下 |
| **占位符文件**（~200 个） | ✅ | 见下 |

---

## 目录结构

完整的目标结构见 `docs/superpowers/execution/2026-06-04-医美咨询小程序-runbook.md` §0.2。

### 顶层

```
/home/ubuntu/personal_work/
├── miniprogram/                  # 微信小程序
├── cloudfunctions/               # 云函数
├── admin/                        # 运营后台 H5
├── tests/                        # 测试
├── migrations/                   # 数据库迁移
├── scripts/                      # 运维脚本
├── .github/workflows/            # CI
├── docs/                         # 文档
│   ├── superpowers/
│   │   ├── specs/                # 设计终稿
│   │   ├── plans/                # 实施计划
│   │   └── execution/            # 执行 Runbook
│   └── 医美咨询小程序-设计草稿-2026-06-04.md  # 已废弃
├── package.json                  # 真实（来自 Task 1）
├── .gitignore                    # 真实（来自 Task 1）
├── README.md                     # 真实（来自 Task 1，但本 FRAMEWORK_STATUS 之后会更新）
├── project.config.json           # 真实（来自 Task 1）
├── miniprogram/app.json          # 真实（来自 Task 1）
├── FRAMEWORK_STATUS.md           # 本文件
└── .git/                         # git 仓库
```

### miniprogram/ 详情

- 10 个页面：login / dashboard / generate / generating / result / history / recharge / profile / order-detail / agreement
- 4 个组件：image-uploader / preset-chip / credit-card / loading-mask
- 4 个 utils：api / auth / format / subscribe
- app.js / app.wxss / sitemap.json（占位符）

### cloudfunctions/ 详情

- 8 个 service（_shared/services/）：aiservice / ratelimiter / creditledger / auditlog / imageaudit / wechatpay / imagestorage / subscribemsg
- 5 个 util（_shared/utils/）：response / validator / jwt / crypto / logger / notifyWechat
- 3 个 middleware（_shared/middlewares/）：auth / adminAuth / errorHandler
- 4 个 user 函数：login / profile / updateProfile / cancel
- 1 个 credit 函数：packages
- 3 个 order 函数：create / list / detail
- 1 个 pay 函数：callback（含 config.json 占位）
- 2 个 agreement 函数：current / accept
- 1 个 preset 函数：list
- 7 个 generate 函数：submit / worker（含 config.json）/ status / list / detail / delete / downloadUrl
- 10 个 admin 函数：_initDb / login（含 config.json）/ dashboard / orders / users / presets / packages / configs / aiLogs / auditLog
- 3 个 cron 函数（含 config.json）：expireGenerations / dailyReconcile / cleanupOrphanFiles

### admin/ 详情

- package.json / vite.config.js / index.html（占位）
- src/main.js / src/router.js / src/api/index.js（占位）
- 9 个 Vue 页面：Login / Dashboard / Orders / Users / Presets / Packages / Configs / AILogs / AuditLog

### tests/ 详情

- unit/migrations/, unit/_shared/utils/, unit/_shared/middlewares/, unit/_shared/services/aiservice|creditledger|ratelimiter/
- 6 个测试 stub：runner.test.js / response.test.js / auth.test.js / creditledger.test.js / prompt.test.js / ratelimiter.test.js
- e2e/setup.js 占位

---

## 占位符识别

每个占位符文件都有这个标志（在第一行注释）：

```javascript
// Placeholder for Runbook Task N
// See: docs/superpowers/execution/2026-06-04-医美咨询小程序-runbook.md Task N
```

可以用以下命令查找所有占位符：

```bash
grep -r "Placeholder for Runbook" /home/ubuntu/personal_work/ -l | head -20
```

要执行某个 Task 时，**打开 Runbook 找到对应 Task 章节**，按其 Steps 把占位符替换为真实代码即可。

---

## 下一步

### 选项 A：开始执行某个 Task

打开 `docs/superpowers/execution/2026-06-04-医美咨询小程序-runbook.md`，找到任意 ⏳ 任务，按 Goal / Pre-reqs / Files / Steps 顺序执行。完成后：

1. 删掉占位符内容
2. 写入 Runbook 中给定的实现
3. 跑 `npm run test:unit`（如果有测试）
4. 提交：`git commit -m "<type>(<scope>): <description>"`
5. 在 Runbook 中把 `⏳` 改成 `✅` + 填上 commit SHA

### 选项 B：批量推进

跑 subagent 驱动模式，按 Runbook 顺序逐个 Task 自动执行 + 自动 review（参见对话历史中的 subagent-driven development 流程）。

### 选项 C：等待/调整

如果想先调整框架（比如增减目录、改占位符风格、增删某些 Task），现在改最便宜。

---

## 已知 / 注意点

- `package.json` 的 `workspaces` 引用 `cloudfunctions/_shared` 和 `admin/`，这两个目录已建好但还没装 node_modules
- 真实 npm 安装（`npm install`）需要陈工在本地跑，云端环境变量在云开发控制台配
- 所有需要云开发/AI key/微信支付的步骤都标了 **(deferred)**，本框架不阻塞

---

*Framework scaffolded 2026-06-04. Total ~200 placeholder files. All 38 Runbook tasks have at least the directory structure ready.*
