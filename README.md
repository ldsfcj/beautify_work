# 医美咨询 H5（AI 整形预览）

> 面向医美咨询师的 H5 网页。手机/平板/PC 三端自适应：上传客户照片 → 选预设项目 → AI 生成整形预览图。
> 配套设计/计划/执行文档见 [`docs/superpowers/`](./docs/superpowers/)。

## 当前状态

✅ **P3 预备完成**（2026-06-08）

- Task 1-19（P0 + P1 + P2）✅ DONE
- Task 20-23（预设项目 / AI 提示词 / 适配器 / AIService 入口）✅ DONE
- Task 24（Redis 限流 + 站内通知）✅ DONE — `2155429`
- Task 25-38（P3 主体 → P6）⏳ pending

> 进度：**24/38 完成**。详见 [执行 Runbook](./docs/superpowers/execution/2026-06-04-医美咨询H5-runbook.md)。

## 技术栈

| 层 | 技术 |
|---|---|
| 用户端前端 | Vue 3 + Vite + Vant 4 + Pinia + Vue Router 4 + Axios |
| 后台前端 | Vue 3 + Vite + Element Plus + Pinia + Vue Router 4 + Axios |
| 后端 | NestJS 10 + TypeScript 5 + TypeORM 0.3 |
| 数据库 | PostgreSQL 15 + Redis 7（本地 Docker） |
| 异步队列 | Bull 4（AI 生成、回调对账） |
| 文件存储 | 阿里云 OSS（生产）/ 本地（开发）|
| AI 厂商 | 阿里通义万相（主）+ 腾讯混元（备）|
| 部署 | 阿里云 ECS + Docker Compose + Nginx |

## 项目结构

```
.
├── web/                  # 用户端 H5（Vue 3 + Vant）  — 端口 5173
├── admin/                # 运营后台 H5（Vue 3 + Element Plus）— 端口 5174
├── server/               # NestJS 后端 + Bull Worker — 端口 3000
├── shared/               # 前后端共享 TS 类型/常量
├── tests/                # 跨项目单元/集成/E2E 测试
├── docs/
│   └── superpowers/
│       ├── specs/2026-06-04-医美咨询H5-design.md
│       ├── plans/2026-06-04-医美咨询H5-implementation.md
│       └── execution/2026-06-04-医美咨询H5-runbook.md   ← 执行入口
├── docker-compose.yml    # 本地开发：PG + Redis
├── docker-compose.prod.yml
├── .env.example
└── package.json          # 根（workspaces: web/admin/server/shared）
```

## 文档

| 文档 | 内容 |
|---|---|
| [`docs/superpowers/specs/2026-06-04-医美咨询H5-design.md`](./docs/superpowers/specs/2026-06-04-医美咨询H5-design.md) | 设计终稿 v2.0（D1-D14 关键决策） |
| [`docs/superpowers/plans/2026-06-04-医美咨询H5-implementation.md`](./docs/superpowers/plans/2026-06-04-医美咨询H5-implementation.md) | 38 任务实施计划 |
| [`docs/superpowers/execution/2026-06-04-医美咨询H5-runbook.md`](./docs/superpowers/execution/2026-06-04-医美咨询H5-runbook.md) | **执行 Runbook（从这里开始）** |

## 开发启动

```bash
# 1. 启动本地 PG + Redis（开发用）
docker compose up -d
docker compose ps   # 两个服务都应为 healthy

# 2. 安装 workspace 依赖
npm install

# 3. 拷贝环境变量模板
cp .env.example .env
# 真实部署时才需要：阿里云 SMS/OSS/AI Key、微信 H5 支付、支付宝

# 4. 启动各端
cd web    && npm run dev   # http://localhost:5173
cd admin  && npm run dev   # http://localhost:5174
cd server && npm run start:dev   # http://localhost:3000/api

# 5. 单元测试
npm run test:unit
```

## 任务执行

执行流程：开 [Runbook](./docs/superpowers/execution/2026-06-04-医美咨询H5-runbook.md) → 选当前任务 → TDD（写测试 → 红 → 实现 → 绿 → commit）→ 在 Runbook 标记 ⏳ → ✅。

提交格式：`<type>(<scope>): <description>` — 例：`feat(auth): 短信验证码登录 + JWT`。

> 历史 v1 小程序 + 云函数架构已废弃，相关文档保留在 `docs/` 仅作存档。
