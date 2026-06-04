# 医美咨询 AI 预览 H5 网页 — 实施计划 v2.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

| 字段 | 值 |
|---|---|
| **文档版本** | v2.0（H5 架构） |
| **创建日期** | 2026-06-04 |
| **上一版** | `2026-06-04-医美咨询小程序-implementation.md`（已废弃，保留作业务参考） |
| **变更动机** | v1.0 用微信云函数；v2.0 改为 NestJS + PostgreSQL + Docker + 自建 H5（陈工原因：小程序需个体工商户资质，门槛高） |
| **目标读者** | 实施团队、陈工本人 |
| **配套文档** | `docs/superpowers/specs/2026-06-04-医美咨询H5-design.md`（设计终稿）<br>`docs/superpowers/execution/2026-06-04-医美咨询H5-runbook.md`（执行 Runbook，逐步骤） |

**一句话定位**：在 **10-13 周内**（1 人开发，10 周核心 + 3 周缓冲）交付医美咨询师专用的 H5 网页，Vue 3 + Vant 前端，NestJS + PostgreSQL + Redis + Bull 队列后端，按次积分计费，含合规水印、运营后台、监控告警。

**架构**（与 v1 的关键差异已在 design §10 详列）：
- **前端**：用户端 Vue 3 + Vite + Vant 4（手机/平板主用，电脑端响应式）+ 运营后台 Vue 3 + Vite + Element Plus（PC 主用），共享 `web/` 同一 Vite 配置、按 `mode=admin` 切换
- **后端**：NestJS 11 + TypeORM + PostgreSQL 16 + Redis 7 + Bull 队列
- **AI**：通义万相（主）+ 腾讯混元（备，明确抛 501），worker `sharp` 合成角标水印
- **支付**：微信 H5（`wechatpay-node-v3`）+ 支付宝 H5（`alipay-sdk`）
- **通知**：站内通知（轮询 `GET /api/notification/list`）+ 邮件兜底
- **CI/CD**：GitHub Actions（lint + test + build + docker push）
- **监控**：Prometheus + Grafana + 企业微信 webhook

---

## 0. 范围、读者与依赖

### 0.1 In Scope（v2.0 必做）

- 用户端 H5（Vue 3 + Vant，11 页：登录/工作台/我的/通知/生成/生成中/结果/历史/充值/订单详情/协议）
- 运营后台 H5（Vue 3 + Element Plus，9 模块：登录/概览/订单/用户/AI日志/预设/套餐/配置/退款/审计）
- NestJS API：12 张业务表 + 4 张审计/通知表 + 全部 REST 接口（design §8）
- 手机号+验证码登录、JWT 双 token、软删注销、30 天后硬删
- 积分流水账（TypeORM 事务）、套餐/订单、微信 H5 + 支付宝 H5、回调验签、对账 cron
- AI 集成：通义（主）+ 混元（备 stub）、提示词拼接、限流（Redis 令牌桶）、Bull 队列、5 辅助接口
- AI 角标 + 免责水印（worker 用 `sharp` 合成）
- Docker Compose（PG + Redis + server + worker + nginx）+ 阿里云 ECS 部署
- Prometheus + Grafana + 企业微信告警

### 0.2 Out of Scope（v2.0 不做）

- 微信小程序（彻底放弃）
- 原生 iOS / Android App
- 客户侧账号（咨询师专用）
- 实时音视频咨询
- 算法备案（H5 无强制要求）
- 多级管理员权限（v2 role=super 单人）
- 完整网安等保认证（v3+）
- 海外部署
- Docker Swarm / K8s（先用 docker-compose 简化运维）

### 0.3 文档读者

| 读者 | 用法 |
|---|---|
| **陈工** | 项目总览、任务分配、风险把控 |
| **实施 Agent** | 按 Runbook 任务卡逐步执行（Steps / Code Snippet / Test / Commit） |
| **Code Review Agent** | 对照本计划检查实现是否偏离 |
| **新加入的开发者** | 通过本文档理解项目分阶段交付节奏 |

### 0.4 与其它文档的关系

```
design.md  (终稿，WHAT  —— 业务模型、API、数据表、决策)
   ↓
plan.md    (本文档，HOW  —— 阶段、任务、TDD 节奏、提交规范)
   ↓
runbook.md (执行，DO  —— 逐步骤、可直接复制粘贴的命令)
```

**任何**业务模型变更必须先改 `design.md`；**任何**任务卡调整应先改 `plan.md`；runbook 是两者的最终执行视图。

---

## 1. 目标文件结构

> 工作目录：`/Users/chenjin/Downloads/beautify_work/`（**注意**：旧 Runbook 写的 `/home/ubuntu/personal_work/` 已被废弃）

```
/Users/chenjin/Downloads/beautify_work/
├── server/                       # NestJS 后端（Task 3-6 创建）
│   ├── src/
│   │   ├── main.ts               # 启动入口
│   │   ├── app.module.ts
│   │   ├── config/               # 配置（环境变量 + DB + Redis）
│   │   ├── common/               # 公共：guards / filters / interceptors / decorators
│   │   │   ├── guards/           # JwtAuthGuard, AdminAuthGuard, RolesGuard
│   │   │   ├── filters/          # AllExceptionsFilter
│   │   │   ├── interceptors/     # TransformInterceptor
│   │   │   └── decorators/       # CurrentUser, Roles
│   │   ├── modules/              # 业务模块
│   │   │   ├── auth/             # Task 9-10
│   │   │   ├── user/             # Task 11
│   │   │   ├── sms/              # Task 9
│   │   │   ├── credit/           # Task 14
│   │   │   ├── credit-package/   # Task 15
│   │   │   ├── order/            # Task 15
│   │   │   ├── payment/          # Task 16-18
│   │   │   ├── preset/           # Task 20
│   │   │   ├── ai/               # Task 21-23
│   │   │   ├── generate/         # Task 24-26
│   │   │   ├── agreement/        # Task 12
│   │   │   ├── notification/     # Task 24
│   │   │   └── admin/            # Task 32-35
│   │   ├── workers/              # Bull worker 进程入口（Task 25）
│   │   └── database/             # TypeORM 数据源 + entities
│   ├── test/                     # e2e 测试
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   └── .env.example
│
├── web/                          # 咨询师端 H5（Task 6）
│   ├── src/
│   │   ├── main.ts
│   │   ├── App.vue
│   │   ├── router/               # 11 个页面路由
│   │   ├── stores/               # Pinia
│   │   ├── pages/
│   │   │   ├── Login.vue
│   │   │   ├── Dashboard.vue
│   │   │   ├── Profile.vue
│   │   │   ├── Notifications.vue
│   │   │   ├── Generate.vue
│   │   │   ├── Generating.vue
│   │   │   ├── Result.vue
│   │   │   ├── History.vue
│   │   │   ├── Recharge.vue
│   │   │   ├── OrderDetail.vue
│   │   │   └── Agreement.vue
│   │   ├── components/           # 共享组件
│   │   ├── api/                  # Axios 封装
│   │   ├── utils/
│   │   └── styles/               # 全局 SCSS + 响应式 mixin
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── .env.development
│
├── admin/                        # 运营后台 H5（Task 7，PC 主用）
│   ├── src/
│   │   ├── main.ts
│   │   ├── router/
│   │   ├── pages/
│   │   │   ├── Login.vue
│   │   │   ├── Dashboard.vue
│   │   │   ├── Orders.vue
│   │   │   ├── Users.vue
│   │   │   ├── Presets.vue
│   │   │   ├── Packages.vue
│   │   │   ├── Configs.vue
│   │   │   ├── Refunds.vue
│   │   │   ├── AILogs.vue
│   │   │   └── AuditLogs.vue
│   │   ├── api/
│   │   ├── stores/
│   │   └── components/
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── migrations/                   # TypeORM migrations（Task 4 + 14 之后陆续新增）
│   ├── data-source.ts
│   ├── 1700000000000-Init.ts
│   ├── 1700000001000-SeedPresets.ts
│   └── 1700000002000-SeedSystemConfigs.ts
│
├── tests/                        # 跨项目测试
│   ├── unit/                     # 单元测试（jest，单进程）
│   ├── integration/              # 集成测试（启动 nest 应用，调 HTTP）
│   └── e2e/                      # Playwright 端到端（Task 37）
│
├── scripts/
│   ├── migrate.sh                # 跑 migration
│   ├── seed.sh                   # 跑 seed
│   ├── backup-pg.sh              # PG 备份（Task 38）
│   └── notify-wechat.sh          # 测试告警 webhook
│
├── docker/                       # 部署相关
│   ├── server.Dockerfile
│   ├── worker.Dockerfile
│   ├── web.Dockerfile
│   ├── admin.Dockerfile
│   ├── nginx.conf
│   ├── prometheus.yml
│   └── grafana-dashboards/
│
├── docker-compose.yml            # 本地开发（Task 2）
├── docker-compose.prod.yml       # 生产部署（Task 38）
│
├── .github/workflows/
│   ├── ci.yml                    # lint + test + build（Task 37）
│   └── deploy-prod.yml           # 推镜像到阿里云（Task 38）
│
├── .env.example
├── .gitignore
├── package.json                  # monorepo 根
├── tsconfig.base.json
├── README.md
└── FRAMEWORK_STATUS.md
```

---

## 2. 阶段概览

| 阶段 | 周 | 任务号 | 交付物 | 可独立运行？ |
|---|---|---|---|---|
| **P0 基础** | W1 | 1-8 | 仓库、Docker、NestJS 脚手架、TypeORM、配置、公共模块、Web/Admin 脚手架 | DB 跑通、空 API 返回 200 |
| **P1 用户+协议** | W2 | 9-13 | SMS、JWT 登录、用户资料、协议、注销 | 可登录、读协议、注销账号 |
| **P2 积分+支付** | W3 | 14-19 | 积分事务、套餐、订单、微信/支付宝 H5、回调对账 | 可买积分（无 AI） |
| **P3 预设+AI** | W4-W5 | 20-27 | 预设库、提示词、AI 适配器、AIService、限流、Generate 提交+Worker | 可发 AI（无前端） |
| **P4 咨询师端页面** | W6-W7 | 28-31 | 11 个 Vue 页面、4 任务批 | **可对外发布** |
| **P5 运营后台** | W8-W9 | 32-35 | 后台登录、9 个模块、4 任务批 | 运营可上线管理 |
| **P6 收尾** | W10 | 36-38 | 监控、E2E+CI、部署+发布 | v2.0 GA |

> 阶段间可暂停重新规划。每个阶段结束做 code review + 用户验收 + commit 里程碑 tag。

### 2.1 工时估算（人天）

| 阶段 | 任务 | 估算 |
|---|---|---|
| P0 | 1-8 | 6 人天 |
| P1 | 9-13 | 5 人天 |
| P2 | 14-19 | 8 人天 |
| P3 | 20-27 | 12 人天 |
| P4 | 28-31 | 6 人天 |
| P5 | 32-35 | 7 人天 |
| P6 | 36-38 | 6 人天 |
| **总计** | **38** | **50 人天**（≈ 10 周 × 1 人） |

加 30% 缓冲 → **13 周** 完工。

---

## 3. TDD 节奏与提交规范

### 3.1 TDD 红绿循环

每个非验收任务的 Steps 都遵循：

```
1. 写失败测试（RED）         → 跑测试 → FAIL
2. 写最小实现（GREEN）        → 跑测试 → PASS
3. 重构（REFACTOR，可选）     → 跑测试 → 仍 PASS
4. 提交（COMMIT）             → 1 个原子提交
```

**TDD 任务**（必须红绿）：Task 14（creditledger）、Task 21（prompt 拼接）。
**普通任务**（先实现后补测）：其它非验收任务，至少补一个 happy-path 单测。
**验收任务**：跑端到端 happy-path（curl / Postman / Playwright），不写新测试。

### 3.2 提交规范

格式：`<type>(<scope>): <description>`

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 修 bug |
| `refactor` | 重构（无功能变化）|
| `test` | 补测试 |
| `docs` | 文档 |
| `chore` | 构建/工具/依赖 |
| `style` | 代码格式（lint） |

scope 示例：`auth` `user` `sms` `credit` `payment` `ai` `generate` `preset` `admin` `web` `server` `shared` `docker` `ci`

✅ 好例：`feat(credit): add consume credit with TypeORM transaction`
❌ 坏例：`update code` / `fix bug` / `feat: 改了一下`

### 3.3 任务卡 Done Criteria 通用项

- 代码已提交
- 测试通过（`npm test` 绿色）
- **所有 (deferred) 步骤已记录**在 Runbook 末尾"待真实环境执行"清单
- Runbook 中任务状态从 ⏳ 改为 ✅，并附 commit SHA

---

## 4. 阶段 0（P0）：基础（W1，Tasks 1-8）

**工时估算**：6 人天
**里程碑**：本地 `curl http://localhost:3000/api/health` 返回 `{status:"ok"}`，Web/Admin 两套 H5 dev server 启动可访问。

### Task 1：初始化项目仓库

**状态**：✅ 已完成（commit `dd354b1`、`6f5b598`）

- `package.json`（根，monorepo 占位）
- `.gitignore`
- `README.md`（待 Task 38 完成后更新到 v2.0 文案）
- `migrations/`、`scripts/`、`tests/`、`admin/` 占位结构

**Done Criteria**：仓库可 `git status` 干净，目录结构覆盖本文档 §1 的所有顶层目录。

---

### Task 2：Docker Compose（PG + Redis）+ 文档

**Goal**：本地一键起 PostgreSQL 16 + Redis 7，文档化连接信息。

**Pre-reqs**：Task 1
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/docker-compose.yml`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/pg-init/01-init.sql`
- Create: `/Users/chenjin/Downloads/beautify_work/docs/dev-setup.md`

**Steps**：

1. **写失败测试**（`tests/unit/docker/compose.test.js`，可选 sanity check）
2. 创建 `docker-compose.yml`：

```yaml
# docker-compose.yml
version: '3.9'
services:
  postgres:
    image: postgres:16-alpine
    container_name: mae_pg
    environment:
      POSTGRES_USER: mae
      POSTGRES_PASSWORD: mae_dev_pwd
      POSTGRES_DB: mae_dev
    ports: ['5432:5432']
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/pg-init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U mae']
      interval: 5s
  redis:
    image: redis:7-alpine
    container_name: mae_redis
    ports: ['6379:6379']
    volumes: [redisdata:/data]
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
volumes:
  pgdata: {}
  redisdata: {}
```

3. 创建初始化 SQL（创建 schema、extension）：

```sql
-- docker/pg-init/01-init.sql
CREATE SCHEMA IF NOT EXISTS mae;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

4. 写 `docs/dev-setup.md`（本地起服务、连接串、Port 5432/6379）。

5. **跑通**：
```bash
cd /Users/chenjin/Downloads/beautify_work
docker-compose up -d
docker ps  # mae_pg + mae_redis 都在
docker exec mae_pg psql -U mae -d mae_dev -c "SELECT 1"  # 1
```

6. **Commit**：`chore(docker): add local pg + redis compose with init script`

**Done Criteria**：`docker-compose ps` 两个服务 healthy，PG 可连接、扩展已建。

---

### Task 3：NestJS 脚手架

**Goal**：可运行的 NestJS 应用，启动时打印 banner，`/api/health` 返回 ok，集成 pino 日志和 Swagger。

**Pre-reqs**：Task 2
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/` 全部（`package.json` `tsconfig.json` `nest-cli.json` `src/main.ts` `src/app.module.ts` `src/health/`）
- Create: `/Users/chenjin/Downloads/beautify_work/server/.env.example`
- Create: `/Users/chenjin/Downloads/beautify_work/.gitignore`（追加 `server/dist/` `server/node_modules/` `.env`）

**Steps**：

1. **写失败测试**（`server/test/health.e2e-spec.ts`）：
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HealthController } from '../src/health/health.controller';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  it('GET /api/health returns ok', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok', uptime: expect.any(Number) });
  });
});
```

跑 `npm test` → **FAIL**（模块不存在）。

2. **生成 NestJS 工程**：
```bash
cd /Users/chenjin/Downloads/beautify_work
npx -y @nestjs/cli@11 new server --package-manager npm --skip-git
cd server
npm install --save pino nestjs-pino pino-http pino-pretty
npm install --save @nestjs/swagger swagger-ui-express
npm install --save helmet compression
npm install --save-dev jest @types/jest supertest ts-jest
```

3. **写 `main.ts`**（全局 prefix `/api`，pino 日志，helmet，CORS，Swagger）：

```typescript
// server/src/main.ts
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api');
  app.flushLogs();

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  if (config.get('NODE_ENV') !== 'production') {
    const swagger = new DocumentBuilder().setTitle('MAE API').setVersion('2.0').build();
    const doc = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('api/docs', app, doc);
  }
  await app.listen(port);
}
bootstrap();
```

4. **写 `app.module.ts`**（Config + Logger + Health）：

```typescript
// server/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty' } : undefined,
      },
    }),
  ],
  controllers: [HealthController],
})
export class AppModule {}
```

5. **写 `health.controller.ts`**（含 uptime）：

```typescript
// server/src/health/health.controller.ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok', uptime: process.uptime() };
  }
}
```

6. **写 `.env.example`**：
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://mae:mae_dev_pwd@localhost:5432/mae_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-me
JWT_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d
```

7. 跑 `npm test` → **PASS**；手动 `curl http://localhost:3000/api/health` → `{status:"ok",...}`。

8. **Commit**：
```bash
git add server/ .gitignore
git commit -m "feat(server): nestjs scaffold with health, pino, swagger"
```

**Done Criteria**：本地 dev server 启动 1s 内 ready，Swagger UI 在 `/api/docs` 可访问，e2e 测试通过。

---

### Task 4：TypeORM 集成 + Migration 框架

**Goal**：TypeORM 连接到 docker-compose 的 PG，能跑 migration 创建 12 张业务表。

**Pre-reqs**：Task 3
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/database/data-source.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/database/database.module.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/migrations/data-source.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/migrations/1700000000000-Init.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/database/entities/`（12 个实体，初始为骨架）
- Modify: `/Users/chenjin/Downloads/beautify_work/server/src/app.module.ts`（注册 DatabaseModule）

**Steps**：

1. **写失败测试**（`server/src/database/database.service.spec.ts`）：断言能 connect + migrate 成功。
2. 安装：
```bash
cd /Users/chenjin/Downloads/beautify_work/server
npm install --save @nestjs/typeorm typeorm pg
npm install --save-dev @types/pg
```

3. 写 **12 个实体骨架**（每个只含主键 + 关键字段占位，迁移会用 raw SQL 完整建表；实体用于 ORM 查询）：

```typescript
// server/src/database/entities/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, DeleteDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ unique: true }) phone_hash: string;  // 明文 hash 用于查重
  @Column() phone_enc: string;                              // AES 加密后的真实手机号
  @Column({ nullable: true }) nickname?: string;
  @Column({ nullable: true }) avatar?: string;
  @Column({ type: 'int', default: 0 }) credits: number;
  @Column({ default: 'active' }) status: 'active' | 'banned' | 'pending_delete';
  @CreateDateColumn() created_at: Date;
  @DeleteDateColumn() deleted_at?: Date;
  @Column({ type: 'timestamptz', nullable: true }) delete_at?: Date;
}
```

（其它 11 个实体：`CreditPackage` `Order` `Generation` `PresetItem` `CreditLedger` `SystemConfig` `AiCallLog` `DownloadLog` `RateLimitBucket` `Refund` `AdminUser` `UserAgreement` `Notification` —— 字段对齐 design §4）

4. 写 `data-source.ts`（TypeORM CLI 用）：

```typescript
// migrations/data-source.ts
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Init1700000000000 } from './1700000000000-Init';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['server/src/database/entities/*.entity.ts'],
  migrations: ['migrations/*.ts'],
  migrationsTableName: 'typeorm_migrations',
});
```

5. 写 `1700000000000-Init.ts` 迁移（design §4 的 12 表完整 DDL）：

```typescript
// migrations/1700000000000-Init.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  name = 'Init1700000000000';
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      phone_hash VARCHAR(64) UNIQUE NOT NULL,
      phone_enc TEXT NOT NULL,
      nickname VARCHAR(64), avatar TEXT,
      credits INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ, delete_at TIMESTAMPTZ
    );`);
    // ... 其它 11 张表（按 design §4 严格落字段 + 索引）
    await qr.query(`CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);`);
  }
  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS notifications, user_agreements, admin_users,
      refunds, rate_limit_buckets, download_logs, ai_call_logs, system_configs,
      credit_ledger, preset_items, generations, orders, credit_packages, users CASCADE;`);
  }
}
```

6. **写 `database.module.ts`**：

```typescript
// server/src/database/database.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as entities from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        url: cfg.get<string>('DATABASE_URL'),
        entities: Object.values(entities),
        synchronize: false,
        migrationsRun: false,  // 启动不自动跑，手动跑
        logging: cfg.get('NODE_ENV') !== 'production' ? 'all' : ['error'],
      }),
    }),
  ],
})
export class DatabaseModule {}
```

7. **跑 migration**：
```bash
cd /Users/chenjin/Downloads/beautify_work
cp server/.env.example server/.env  # 改 DATABASE_URL
npx typeorm-ts-node-commonjs migration:run -d migrations/data-source.ts
docker exec mae_pg psql -U mae -d mae_dev -c "\dt"  # 14 张表（含 typeorm_migrations）
```

8. **Commit**：`feat(server): typeorm + 14 tables migration`

**Done Criteria**：`\dt` 看到 14 张表，启动 NestJS 不再 "DATABASE_URL not set" 报错。

---

### Task 5：公共模块（Guards / Filters / Interceptors / Decorators）

**Goal**：JwtAuthGuard / AdminAuthGuard / RolesGuard / 全局 ValidationPipe / 全局 ExceptionFilter / TransformInterceptor / CurrentUser 装饰器全部到位。

**Pre-reqs**：Task 3（已注入 ConfigModule + LoggerModule）
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/guards/jwt-auth.guard.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/guards/admin-auth.guard.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/guards/roles.guard.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/filters/all-exceptions.filter.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/interceptors/transform.interceptor.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/decorators/current-user.decorator.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/decorators/roles.decorator.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/decorators/public.decorator.ts`
- Modify: `/Users/chenjin/Downloads/beautify_work/server/src/main.ts`（注册全局 pipe/filter/interceptor）
- Create: `/Users/chenjin/Downloads/beautify_work/tests/unit/common/`（每文件一个单测）

**Steps**：

1. **写失败测试**（每个组件一个 spec）。

2. **写 `JwtAuthGuard`**（用 `@nestjs/passport` + `passport-jwt`）：

```typescript
// server/src/common/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) { super(); }
  canActivate(ctx: any) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    return isPublic ? true : super.canActivate(ctx);
  }
}
```

3. **写 `AdminAuthGuard`**（基于 JwtAuthGuard + 角色校验）：

```typescript
// server/src/common/guards/admin-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
export class AdminAuthGuard extends AuthGuard('admin-jwt') {}
```

4. **写 `RolesGuard`**：读 `@Roles('super')` 元数据 + JWT payload。

5. **写 `AllExceptionsFilter`**：统一返回 `{ code, message, requestId }`，5xx 走 pino 记录。

```typescript
// server/src/common/filters/all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const status = exception instanceof HttpException
      ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException
      ? exception.getResponse() : { message: 'Internal Server Error' };
    this.logger.error({ exception, path: req.url }, 'Request failed');
    res.status(status).json({
      code: typeof payload === 'string' ? 'ERROR' : (payload as any).code || 'ERROR',
      message: typeof payload === 'string' ? payload : (payload as any).message,
      requestId: req.id,
    });
  }
}
```

6. **写 `TransformInterceptor`**：包装 `data` 字段：

```typescript
// server/src/common/interceptors/transform.interceptor.ts
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, { code: number; data: T }> {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<{ code: number; data: T }> {
    return next.handle().pipe(map((data) => ({ code: 0, data })));
  }
}
```

7. **写 `CurrentUser` 装饰器**：

```typescript
// server/src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

8. **main.ts 注册**（节选）：

```typescript
app.useGlobalPipes(new ValidationPipe({
  whitelist: true, transform: true, forbidNonWhitelisted: true,
}));
app.useGlobalFilters(new AllExceptionsFilter(app.get(PinoLogger)));
app.useGlobalInterceptors(new TransformInterceptor());
app.useGlobalGuards(new JwtAuthGuard(app.get(Reflector)));  // 配合 @Public() 跳过
```

9. **Commit**：`feat(shared): jwt/admin guards, global filter, interceptor, decorators`

**Done Criteria**：所有公共模块单测通过；写一个临时 `/api/_test/echo` 端点，断言 `401` → 注入 token → `200`，关闭端点后 commit。

---

### Task 6：Web 端 H5 脚手架（Vue 3 + Vant）

**Goal**：可启动的 Vite + Vue 3 + Vant 4 + Pinia + Vue Router + Axios H5，含响应式 mixin。

**Pre-reqs**：Task 1
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/web/`（vite.config / package.json / index.html / src/* 全部）
- Create: `/Users/chenjin/Downloads/beautify_work/web/src/api/http.ts`（Axios 实例 + interceptor）
- Create: `/Users/chenjin/Downloads/beautify_work/web/src/utils/breakpoint.ts`（响应式断点 mixin）

**Steps**：

1. **脚手架生成**：
```bash
cd /Users/chenjin/Downloads/beautify_work
npm create vite@latest web -- --template vue-ts
cd web
npm install vant pinia vue-router axios
npm install --save-dev sass unplugin-vue-components @vant/auto-import-resolver
```

2. **写 `vite.config.ts`**（Vant 按需、自动断点 px-to-vw）：

```typescript
// web/vite.config.ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';

export default defineConfig({
  plugins: [
    vue(),
    Components({ resolvers: [VantResolver()] }),
  ],
  server: { port: 5173, host: '0.0.0.0' },
  css: { preprocessorOptions: { scss: { additionalData: `@use "@/styles/variables.scss" as *;` } } },
});
```

3. **写 `http.ts`**（token 注入 + 401 跳登录）：

```typescript
// web/src/api/http.ts
import axios from 'axios';
import { showToast } from 'vant';
import router from '@/router';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000,
});

http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('access_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (r) => r.data.data,  // TransformInterceptor 已包过
  (e) => {
    if (e.response?.status === 401) {
      localStorage.removeItem('access_token');
      router.push('/login');
    } else if (e.response?.status === 402) {
      showToast('积分不足');
    } else {
      showToast(e.response?.data?.message || '网络错误');
    }
    return Promise.reject(e);
  },
);
```

4. **写 `breakpoint.ts`**：

```typescript
// web/src/utils/breakpoint.ts
import { ref, onMounted, onUnmounted } from 'vue';
export type Device = 'mobile' | 'tablet' | 'desktop';
export function useBreakpoint() {
  const device = ref<Device>('mobile');
  const onResize = () => {
    const w = window.innerWidth;
    device.value = w < 768 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  };
  onMounted(() => { onResize(); window.addEventListener('resize', onResize); });
  onUnmounted(() => window.removeEventListener('resize', onResize));
  return { device };
}
```

5. **写 `router/index.ts`** 占位（11 路由，Task 28-30 逐个实现页面组件）：

```typescript
// web/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
const routes = [
  { path: '/login', component: () => import('@/pages/Login.vue'), meta: { public: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: () => import('@/pages/Dashboard.vue') },
  // ... 11 个路由占位
];
export default createRouter({ history: createWebHistory(), routes });
```

6. **跑通**：`npm run dev` → 浏览器 `http://localhost:5173` 看到 hello 页。
7. **Commit**：`feat(web): vue 3 + vant + pinia + router scaffold with http client`

**Done Criteria**：dev server 启动 < 2s；`/login` 路由可达；`http` 拦截器单测通过。

---

### Task 7：Admin H5 脚手架（Vue 3 + Element Plus）

**Goal**：可启动的运营后台 Vite 项目，含登录页占位、9 模块路由表。

**Pre-reqs**：Task 1
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/admin/`（vite.config / package.json / index.html / src/*）
- 复用 `web/src/api/http.ts` 的设计，但用 admin 命名空间

**Steps**：

1. **脚手架**：
```bash
cd /Users/chenjin/Downloads/beautify_work
rm -rf admin/src  # 清掉旧 v1 占位
npm create vite@latest admin-tmp -- --template vue-ts
mv admin-tmp/* admin/ && mv admin-tmp/.* admin/ 2>/dev/null
rm -rf admin-tmp
cd admin
npm install element-plus pinia vue-router axios echarts
npm install --save-dev sass unplugin-vue-components unplugin-auto-import
```

2. **写 `main.ts`**（注册 Element Plus、按需、Pinia、Router）：

```typescript
// admin/src/main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import router from './router';
import App from './App.vue';

createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app');
```

3. **写 `router`**（9 路由 + 守卫：未登录跳 `/login`）：

```typescript
// admin/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router';
const routes = [
  { path: '/login', component: () => import('@/pages/Login.vue'), meta: { public: true } },
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', component: () => import('@/pages/Dashboard.vue') },
  { path: '/orders', component: () => import('@/pages/Orders.vue') },
  { path: '/users', component: () => import('@/pages/Users.vue') },
  { path: '/presets', component: () => import('@/pages/Presets.vue') },
  { path: '/packages', component: () => import('@/pages/Packages.vue') },
  { path: '/configs', component: () => import('@/pages/Configs.vue') },
  { path: '/refunds', component: () => import('@/pages/Refunds.vue') },
  { path: '/ai-logs', component: () => import('@/pages/AILogs.vue') },
  { path: '/audit-logs', component: () => import('@/pages/AuditLogs.vue') },
];
const router = createRouter({ history: createWebHistory('/admin/'), routes });
router.beforeEach((to) => {
  const token = localStorage.getItem('admin_token');
  if (!to.meta.public && !token) return '/login';
});
export default router;
```

> 路由 base 用 `/admin/`，但 Vite dev 阶段 base 设为 `/`（Task 38 nginx 部署时改）。

4. **Commit**：`feat(admin): vue 3 + element-plus scaffold with router guards`

**Done Criteria**：`npm run dev`（端口 5174）可访问，`/admin/dashboard` 未登录被跳到 `/admin/login`。

---

### Task 8：P0 验收

**Goal**：P0 全部任务打通端到端。

**Acceptance Checklist**：

- [ ] `docker-compose up -d` → PG + Redis 健康
- [ ] `cd server && npm run start:dev` → 启动 banner 出现，`/api/health` 返回 200
- [ ] `cd server && npm test` → 公共模块所有单测通过
- [ ] 跑 migration：`npx typeorm migration:run` → 14 张表创建成功
- [ ] `cd web && npm run dev` → 5173 可访问，看到 hello 页
- [ ] `cd admin && npm run dev` → 5174 可访问，未登录跳 login
- [ ] 所有 commit 符合 §3.2 规范
- [ ] Runbook 中 Task 2-7 状态全 ⏳ → ✅

**Done Criteria**：上面 8 项全部勾选，截图存 `docs/p0-screenshots/`，commit `chore(release): p0 milestone`。

---

## 5. 阶段 1（P1）：用户 + 协议（W2，Tasks 9-13）

**工时估算**：5 人天
**里程碑**：浏览器能登录、看协议、查/改/注销自己账号。

### Task 9：SMS 模块

**Goal**：阿里云短信 SDK 封装，发送 6 位验证码到 Redis，TTL 60s，IP 限流 1/min。

**Pre-reqs**：Task 4（已建表）、Task 5（Redis 注入）、Task 2（Redis 跑通）
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/sms/sms.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/sms/sms.controller.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/sms/sms.module.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/sms/sms.service.spec.ts`（mock SDK）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/sms/rate-limiter.ts`（Lua 限流）

**Steps**：

1. **写失败测试**（`sms.service.spec.ts`）：mock aliyun SDK，断言：
   - `sendCode('13800138000')` 写 Redis key `sms:13800138000` = 6 位数字，TTL 60s
   - 同一手机号 60s 内第二次调 → 抛 429
   - 同一 IP 1min 内第 2 次调 → 抛 429

2. **写 `sms.service.ts`**（关键签名）：

```typescript
// server/src/sms/sms.service.ts
@Injectable()
export class SmsService {
  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly logger: PinoLogger,
  ) {}

  async sendCode(phone: string, ip: string): Promise<{ ok: true; ttl: number }> {
    await this.checkIpRateLimit(ip);
    await this.checkPhoneCooldown(phone);
    const code = randomInt(100000, 999999).toString();
    await this.redis.set(`sms:${phone}`, code, 'EX', 60);
    // (deferred) 真实环境调 aliyun SDK
    if (this.config.get('NODE_ENV') === 'production') {
      await this.aliyunSend(phone, code);
    } else {
      this.logger.warn({ phone, code }, '[dev] sms code');
    }
    return { ok: true, ttl: 60 };
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const stored = await this.redis.get(`sms:${phone}`);
    if (stored === code) {
      await this.redis.del(`sms:${phone}`);
      return true;
    }
    return false;
  }
}
```

3. **写 `rate-limiter.ts`**（Redis Lua 令牌桶 / 简单计数）：

```typescript
// server/src/sms/rate-limiter.ts
export async function checkIpRateLimit(redis: Redis, ip: string, maxPerMin: number) {
  const key = `sms:ip:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > maxPerMin) throw new HttpException('请求过于频繁', 429);
}
```

4. **写 `sms.controller.ts`**（POST `/api/auth/sms/send`，不需鉴权）：

```typescript
@Controller('auth/sms')
export class SmsController {
  constructor(private readonly sms: SmsService) {}
  @Post('send')
  @Public()
  async send(@Body() dto: SendSmsDto, @Req() req: Request) {
    const ip = req.ip;
    const ttl = await this.sms.sendCode(dto.phone, ip);
    return { ok: true, ttl: ttl.ttl };
  }
}
```

5. **Commit**：`feat(sms): aliyun sdk wrapper with redis cooldown + ip rate limit`

**Done Criteria**：dev 环境下 `curl -X POST /api/auth/sms/send -d '{"phone":"13800138000"}'` 200，控制台打出 `[dev] sms code 123456`，60s 内第二次 429。

---

### Task 10：登录 + JWT

**Goal**：手机号 + 验证码 → 签发 access (30min) + refresh (7d)，首次登录写 `users` + 默认昵称。

**Pre-reqs**：Task 9
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/auth/auth.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/auth/auth.controller.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/auth/jwt.strategy.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/auth/dto/login.dto.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/auth/auth.service.spec.ts`
- Modify: `/Users/chenjin/Downloads/beautify_work/server/src/app.module.ts`（注册 AuthModule、PassportModule、JwtModule）

**Steps**：

1. **写失败测试**：
```typescript
describe('AuthService.login', () => {
  it('creates user on first login', async () => {
    const result = await svc.login({ phone: '13800138000', code: '123456' });
    expect(result.token).toMatch(/^ey/);
    expect(result.user.phone_mask).toBe('138****8000');
  });
});
```

2. **写 `auth.service.ts`**（核心逻辑）：

```typescript
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity) private users: Repository<UserEntity>,
    private sms: SmsService,
    private jwt: JwtService,
    private crypto: CryptoService,
  ) {}

  async login(dto: LoginDto) {
    const ok = await this.sms.verifyCode(dto.phone, dto.code);
    if (!ok) throw new UnauthorizedException('验证码错误或已过期');
    const phoneHash = hashSha256(dto.phone);
    let user = await this.users.findOne({ where: { phone_hash: phoneHash } });
    if (!user) {
      user = this.users.create({
        phone_hash: phoneHash,
        phone_enc: this.crypto.encrypt(dto.phone),
        nickname: `用户${dto.phone.slice(-4)}`,
        credits: 0,
        status: 'active',
      });
      await this.users.save(user);
    }
    if (user.status !== 'active') throw new ForbiddenException('账号已封禁或注销中');
    return {
      token: await this.signAccess(user),
      refresh_token: await this.signRefresh(user),
      user: this.toDto(user),
    };
  }

  async refresh(refreshToken: string) {
    const payload = await this.jwt.verifyAsync(refreshToken);
    const user = await this.users.findOneByOrFail({ id: payload.sub });
    return {
      token: await this.signAccess(user),
      refresh_token: await this.signRefresh(user),
    };
  }

  private async signAccess(user: UserEntity) {
    return this.jwt.signAsync(
      { sub: user.id, type: 'user' },
      { expiresIn: this.config.get('JWT_EXPIRES_IN', '30m') },
    );
  }
  // ... signRefresh / toDto
}
```

3. **写 `jwt.strategy.ts`**：

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET'),
      ignoreExpiration: false,
    });
  }
  async validate(payload: { sub: string; type: string }) {
    return { id: payload.sub, type: payload.type };  // 挂到 req.user
  }
}
```

4. **写 `auth.controller.ts`**：

```typescript
@Controller('auth')
export class AuthController {
  @Post('login') @Public()
  login(@Body() dto: LoginDto) { return this.svc.login(dto); }

  @Post('refresh') @Public()
  refresh(@Body('refresh_token') t: string) { return this.svc.refresh(t); }
}
```

5. **Commit**：`feat(auth): phone+code login with access+refresh jwt`

**Done Criteria**：用 dev 控制台打出的验证码，调用 `/api/auth/login` 拿到 token；用 token 调 `/api/user/me`（Task 11）通过。

---

### Task 11：用户资料 + 注销

**Goal**：`GET/PATCH/DELETE /api/user/me` 三接口，软删 + 30 天后定时硬删。

**Pre-reqs**：Task 10
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/user/user.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/user/user.controller.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/user/dto/update-profile.dto.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/user/user.service.spec.ts`

**Steps**：

1. **写失败测试**：mock user repo，断言 PATCH 改 nickname 写 `updated_at`，DELETE 设 `deleted_at` + `delete_at = now() + 30d`。

2. **写 `user.service.ts`**：

```typescript
@Injectable()
export class UserService {
  @InjectRepository(UserEntity) private users: Repository<UserEntity>;

  async getMe(userId: string) {
    const u = await this.users.findOneByOrFail({ id: userId });
    return { id: u.id, nickname: u.nickname, avatar: u.avatar,
             phone_mask: this.crypto.mask(u.phone_enc), credits: u.credits };
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    await this.users.update(userId, { ...dto });
    return this.getMe(userId);
  }

  async cancel(userId: string) {
    const deleteAt = new Date(Date.now() + 30 * 86400_000);
    await this.users.update(userId, {
      status: 'pending_delete', delete_at: deleteAt, deleted_at: new Date(),
    });
    return { ok: true, delete_at: deleteAt };
  }
}
```

3. **写 `user.controller.ts`**（用 `@CurrentUser()` 装饰器）：

```typescript
@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  @Get('me') me(@CurrentUser() u: { id: string }) { return this.svc.getMe(u.id); }
  @Patch('me') update(@CurrentUser() u: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.svc.updateMe(u.id, dto);
  }
  @Delete('me') cancel(@CurrentUser() u: { id: string }) { return this.svc.cancel(u.id); }
}
```

4. **Commit**：`feat(user): get/update/cancel me with 30d hard delete scheduled`

**Done Criteria**：三接口集成测试通过，DB 看到 `delete_at` 字段写入未来 30 天。

---

### Task 12：协议模块

**Goal**：`GET /api/agreement/current?type=` 读 `system_configs.protocols[type].content`，`POST /api/agreement/accept` 写 `user_agreements`，启动时强制弹窗（前端在 Login 页判断）。

**Pre-reqs**：Task 4（表已建）、Task 11（user）
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/agreement/agreement.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/agreement/agreement.controller.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/agreement/agreement.service.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/migrations/1700000002000-SeedSystemConfigs.ts`（写 `protocols.user.content` 等）

**Steps**：

1. **写失败测试**：mock SystemConfig repo，断言：
   - 已知 type → 返回 content
   - POST accept → 写一条 user_agreements，包含 user_id + type + version
   - 重复接受同 version → 幂等

2. **写 `agreement.service.ts`**：

```typescript
@Injectable()
export class AgreementService {
  async getCurrent(type: 'user' | 'privacy') {
    const cfg = await this.configs.findOneByOrFail({ key: `protocols.${type}` });
    return { type, version: cfg.value.version, content: cfg.value.content };
  }

  async accept(userId: string, type: string, version: string) {
    await this.userAgreements
      .createQueryBuilder()
      .insert()
      .values({ user_id: userId, type, version })
      .orIgnore()  // UNIQUE 约束
      .execute();
    return { ok: true };
  }
}
```

3. **写 migration**（种默认协议 + 模型 + 限流 + 提示词前后缀）：

```typescript
// migrations/1700000002000-SeedSystemConfigs.ts
export class SeedSystemConfigs1700000002000 implements MigrationInterface {
  async up(qr: QueryRunner) {
    await qr.query(`INSERT INTO system_configs (key, value, updated_by) VALUES
      ('protocols.user', '{"version":"v1.0","content":"...待陈工填..."}','system'),
      ('protocols.privacy', '{"version":"v1.0","content":"...待陈工填..."}','system'),
      ('credit_pricing_table', '{"1":2,"2":3,"3":4,"4+":5}','system'),
      ('rate_limit', '{"per_minute":5,"per_day":50,"burst":3}','system'),
      ('ai_models', '{"primary":{"vendor":"tongyi","model":"wanx-v1","enabled":true},
                      "secondary":{"vendor":"hunyuan","model":"hunyuan-vision","enabled":false},
                      "allow_fallback":true}','system'),
      ('prompt_prefix','medical aesthetic reference photo, frontal view, high detail, ','system'),
      ('prompt_suffix',', preserve ethnicity and facial identity, natural result, no text overlay, realistic photograph','system')
    ON CONFLICT (key) DO NOTHING;`);
  }
}
```

4. **Commit**：`feat(agreement): current/accept + seed system configs`

**Done Criteria**：调 `GET /api/agreement/current?type=user` 返回种子的内容；accept 写库；启动 `app` 时 `protocols.user` 已存在。

---

### Task 13：P1 验收

**Acceptance Checklist**：

- [ ] `POST /api/auth/sms/send` 60s 内第二次 429
- [ ] dev 控制台有验证码
- [ ] `POST /api/auth/login` → 返回 access + refresh + user
- [ ] `GET /api/user/me` 带 token 通过；不带 401
- [ ] `PATCH /api/user/me` 改 nickname 成功
- [ ] `DELETE /api/user/me` → 用户 `status=pending_delete`，`delete_at` 是 +30d
- [ ] `GET /api/agreement/current?type=user` 返回种子内容
- [ ] `POST /api/agreement/accept` 写 `user_agreements`，二次幂等
- [ ] Runbook 9-12 状态全 ⏳ → ✅

**Done Criteria**：截图 + commit `chore(release): p1 milestone`。

---

## 6. 阶段 2（P2）：积分 + 支付（W3，Tasks 14-19）

**工时估算**：8 人天
**里程碑**：可买积分（无 AI）；微信/支付宝 H5 支付能回调入账。

### Task 14：积分事务（TDD）

**Goal**：`creditledger` 服务提供 `consume` / `recharge` / `refund`，全部用 TypeORM 事务。

**Pre-reqs**：Task 4
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/credit/creditledger.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/credit/creditledger.service.spec.ts`（**TDD 红绿**）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/credit/credit.module.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/credit/dto/consume.dto.ts`

**Steps**：

1. **写失败测试**（先红）：

```typescript
describe('CreditLedgerService', () => {
  it('consume deducts from user credits atomically', async () => {
    await svc.recharge(userId, 100, 'init');
    const result = await svc.consume(userId, 30, 'generate', 'gen_1');
    expect(result.balanceAfter).toBe(70);
    const u = await users.findOneByOrFail({ id: userId });
    expect(u.credits).toBe(70);
  });
  it('consume throws INSUFFICIENT_CREDITS when balance < amount', async () => {
    await svc.recharge(userId, 10, 'init');
    await expect(svc.consume(userId, 30, 'gen', 'g'))
      .rejects.toThrow(/INSUFFICIENT_CREDITS/);
    const u = await users.findOneByOrFail({ id: userId });
    expect(u.credits).toBe(10);  // 未扣
  });
  it('recharge adds to credits + writes ledger', async () => {
    await svc.recharge(userId, 100, 'order_1');
    const rows = await ledger.find({ where: { user_id: userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].balance_after).toBe(100);
  });
  it('refund creates positive ledger entry', async () => {
    await svc.recharge(userId, 100, 'o1');
    await svc.consume(userId, 30, 'g', 'g1');
    await svc.refund(userId, 30, 'g1', 'reason');
    const u = await users.findOneByOrFail({ id: userId });
    expect(u.credits).toBe(100);
  });
});
```

跑 → **FAIL**（无实现）。

2. **写最小实现**（绿）：

```typescript
@Injectable()
export class CreditLedgerService {
  constructor(
    @InjectRepository(CreditLedgerEntity) private ledger: Repository<CreditLedgerEntity>,
    @InjectRepository(UserEntity) private users: Repository<UserEntity>,
  ) {}

  async consume(userId: string, amount: number, type: string, relatedId: string) {
    if (amount <= 0) throw new BadRequestException('amount must be positive');
    return this.dataSource.transaction(async (em) => {
      const u = await em.findOne(UserEntity, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (!u || u.credits < amount) {
        throw new BadRequestException({ code: 'INSUFFICIENT_CREDITS', message: '积分不足' });
      }
      u.credits -= amount;
      await em.save(u);
      const entry = em.create(CreditLedgerEntity, {
        user_id: userId, type, amount: -amount, balance_after: u.credits, related_id: relatedId,
      });
      await em.save(entry);
      return { balanceAfter: u.credits };
    });
  }

  async recharge(userId: string, amount: number, relatedId: string) {
    return this.dataSource.transaction(async (em) => {
      const u = await em.findOne(UserEntity, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      u.credits += amount;
      await em.save(u);
      await em.save(em.create(CreditLedgerEntity, {
        user_id: userId, type: 'recharge', amount, balance_after: u.credits, related_id: relatedId,
      }));
    });
  }

  async refund(userId: string, amount: number, relatedId: string, note: string) {
    return this.recharge.call(this, userId, amount, relatedId);  // type 覆盖
  }
}
```

跑 → **PASS**。
3. **Commit**：`feat(credit): creditledger service with typeorm transaction (TDD)`

**Done Criteria**：4 个测试全绿；事务回滚测试（用并发模拟）通过。

---

### Task 15：套餐 + 订单 API

**Goal**：`GET /api/credit/packages`、`POST /api/order/create`、`GET /api/order/list`、`GET /api/order/:no`。

**Pre-reqs**：Task 14
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/credit-package/credit-package.controller.ts`（含 service）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/order/order.controller.ts`（含 service）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/order/order.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/order/order.service.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/migrations/1700000001000-SeedCreditPackages.ts`

**Steps**：

1. **写失败测试**（order service）：
   - `create(userId, packageId, 'wechat')` → 写 `orders` status=pending，返 `order_no` + 调支付（mock）
   - `list(userId)` → 按时间倒序

2. **写 seed**（4 档套餐，design §1.1 D2 提到的 50/220/580/2400 积分）：

```typescript
// migrations/1700000001000-SeedCreditPackages.ts
async up(qr: QueryRunner) {
  await qr.query(`INSERT INTO credit_packages (name, credits, price_cents, bonus_credits, validity_days, is_active, sort_order) VALUES
    ('体验', 50, 500, 0, 90, true, 10),
    ('标准', 220, 2000, 20, 180, true, 20),
    ('专业', 580, 5000, 80, 365, true, 30),
    ('旗舰', 2400, 20000, 400, 365, true, 40)
    ON CONFLICT DO NOTHING;`);
}
```

3. **写 `order.service.ts`**（order_no 用 nanoid 12 位）：

```typescript
@Injectable()
export class OrderService {
  async create(userId: string, packageId: string, method: PaymentMethod) {
    const pkg = await this.pkgs.findOneByOrFail({ id: packageId, is_active: true });
    const order = await this.orders.save(this.orders.create({
      order_no: 'M' + nanoid(12),
      user_id: userId, package_id: packageId,
      credits: pkg.credits + pkg.bonus_credits, amount_cents: pkg.price_cents,
      status: 'pending', payment_method: method,
    }));
    const payInfo = await this.payment.createPayUrl(order);  // Task 16/17 实现
    return { order_no: order.order_no, ...payInfo };
  }

  async list(userId: string, page: number, size: number) { /* 分页 */ }
  async detail(userId: string, orderNo: string) { /* 鉴权 + 返详情 */ }
}
```

4. **Commit**：`feat(order): packages list, order create/list/detail + seed 4 packages`

**Done Criteria**：4 档套餐 seed 成功；create 返回 order_no + 调支付抛"未实现"（占位）。

---

### Task 16：微信 H5 支付

**Goal**：封装 `wechatpay-node-v3`，`createPayUrl` 返 H5 跳转 URL（`https://wx.tenpay.com/...`）。

**Pre-reqs**：Task 15
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/wechat/wechat.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/wechat/wechat.service.spec.ts`（mock SDK）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/payment.module.ts`
- Modify: `/Users/chenjin/Downloads/beautify_work/.env.example`（追加 5 个 WECHATPAY_* 变量）

**Steps**：

1. **写失败测试**：mock `wechatpay-node-v3`，断言 `createPayUrl` 返 `h5_url`。
2. 安装：
```bash
cd server && npm install wechatpay-node-v3
```

3. **写 `wechat.service.ts`**（**deferred** 真实环境）：

```typescript
@Injectable()
export class WechatService {
  private pay: any;
  constructor(private cfg: ConfigService) {
    if (cfg.get('NODE_ENV') === 'production') {
      this.pay = new WxPay({
        appid: cfg.get('WECHATPAY_APPID'),
        mchid: cfg.get('WECHATPAY_MCH_ID'),
        publicKey: fs.readFileSync('./apiclient_cert.pem'),  // (deferred)
        privateKey: fs.readFileSync('./apiclient_key.pem'),  // (deferred)
        key: cfg.get('WECHATPAY_API_V3_KEY'),
      });
    }
  }
  async createH5Url(order: OrderEntity) {
    if (process.env.NODE_ENV !== 'production') {
      return { h5_url: `https://wx.tenpay.com/mock?order_no=${order.order_no}` };
    }
    const res = await this.pay.transactions_h5({
      description: `积分套餐-${order.credits}`,
      out_trade_no: order.order_no,
      notify_url: this.cfg.get('WECHATPAY_NOTIFY_URL'),
      amount: { total: order.amount_cents, currency: 'CNY' },
      scene_info: { h5_info: { type: 'Wap', app_name: '医美咨询', app_url: 'https://...' } },
    });
    return { h5_url: res.h5_url };
  }
}
```

4. **Commit**：`feat(payment): wechat h5 wrapper with mock fallback`

**Done Criteria**：dev 调 `createH5Url` 返 mock URL；生产环境需真实证书（deferred）。

---

### Task 17：支付宝 H5 支付

**Goal**：封装 `alipay-sdk`，手机网站支付。

**Pre-reqs**：Task 15
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/alipay/alipay.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/alipay/alipay.service.spec.ts`

**Steps**：

1. **写失败测试**：mock alipay SDK，断言 `createH5Url` 返支付链接。
2. 安装：`npm install alipay-sdk`
3. **写 `alipay.service.ts`**：

```typescript
@Injectable()
export class AlipayService {
  private sdk: any;
  constructor(private cfg: ConfigService) {
    if (cfg.get('NODE_ENV') === 'production') {
      this.sdk = new AlipaySdk({
        appId: cfg.get('ALIPAY_APP_ID'),
        privateKey: cfg.get('ALIPAY_PRIVATE_KEY'),
        alipayPublicKey: cfg.get('ALIPAY_PUBLIC_KEY'),
      });
    }
  }
  async createH5Url(order: OrderEntity) {
    if (process.env.NODE_ENV !== 'production') {
      return { h5_url: `https://openapi.alipay.com/mock?order_no=${order.order_no}` };
    }
    const res = await this.sdk.exec('alipay.trade.wap.pay', {
      notify_url: this.cfg.get('ALIPAY_NOTIFY_URL'),
      bizContent: {
        out_trade_no: order.order_no,
        total_amount: (order.amount_cents / 100).toFixed(2),
        subject: `积分套餐-${order.credits}`,
        product_code: 'QUICK_WAP_WAY',
      },
    });
    return { h5_url: res };
  }
}
```

4. **Commit**：`feat(payment): alipay h5 wrapper with mock fallback`

---

### Task 18：支付回调 + 对账 cron

**Goal**：
- `POST /api/payment/wechat/notify`（**不需鉴权**）：验签 → 查 order → 调 `creditledger.recharge` → 写 `ai_call_logs` 不写，这是订单日志；写 audit
- `POST /api/payment/alipay/notify` 同上
- **对账 cron**：每日 02:00 跑 `dailyReconcile`，扫 `orders.status=pending && paid_at < now-30min` 的，调支付平台查单 API，更新或告警

**Pre-reqs**：Tasks 16、17
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/payment.controller.ts`（notify endpoints）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/payment.service.ts`（回调处理 + 对账）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/payment/payment.service.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/cron/daily-reconcile.cron.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/cron/cron.module.ts`（`@nestjs/schedule` 注册）

**Steps**：

1. **写失败测试**：mock 通知 payload，断言：
   - 验签失败 → 400
   - 验签通过 + order 存在 + status=pending → 调 `recharge` + status=paid + 返回微信要求 XML
2. **写 `payment.service.ts`**：

```typescript
@Injectable()
export class PaymentService {
  async handleWechatNotify(rawXml: string, headers: any) {
    const verified = this.wechat.verifySign(rawXml, headers);  // 内部验签
    if (!verified) throw new BadRequestException('签名错误');
    const data = await this.wechat.decodeNotify(rawXml);
    const order = await this.orders.findOneByOrFail({ order_no: data.out_trade_no });
    if (order.status === 'paid') return { code: 'SUCCESS', message: 'OK' };  // 幂等
    if (data.trade_state !== 'SUCCESS') {
      return { code: 'SUCCESS', message: '已接收' };
    }
    await this.ledger.recharge(order.user_id, order.credits, order.order_no);
    await this.orders.update(order.id, { status: 'paid', txn_id: data.transaction_id, paid_at: new Date() });
    return { code: 'SUCCESS', message: 'OK' };
  }
  // handleAlipayNotify 同理
}
```

3. **写 cron**：

```typescript
@Cron('0 2 * * *', { name: 'dailyReconcile' })
async reconcile() {
  const stale = await this.orders.find({
    where: { status: 'pending', created_at: LessThan(daysAgo(1)) },
  });
  for (const o of stale) {
    const remote = await this.wechat.queryOrder(o.order_no);
    if (remote.trade_state === 'SUCCESS') {
      await this.handleWechatNotify(/* 构造内部对象 */);
    } else {
      await this.notify.warn(`订单 ${o.order_no} 30min 未支付且未取消`);
    }
  }
}
```

4. **Commit**：`feat(payment): notify handler (wechat/alipay) + daily reconcile cron`

**Done Criteria**：mock 通知 → 调 recharge + 写 audit；cron 手动触发（`POST /api/admin/cron/run/dailyReconcile`）跑通。

---

### Task 19：P2 验收

**Acceptance Checklist**：

- [ ] `GET /api/credit/packages` 返回 4 档
- [ ] `POST /api/order/create` → 返 order_no + mock h5_url
- [ ] mock 微信/支付宝通知 → 调 `recharge` → 用户积分 += 套餐数
- [ ] `users.credits` 缓存 = `credit_ledger` 最后一条 `balance_after`（一致性）
- [ ] 重复通知幂等（不重复入账）
- [ ] 对账 cron 跑通，扫到 stale 订单告警
- [ ] Runbook 14-18 状态全 ⏳ → ✅

**Done Criteria**：commit `chore(release): p2 milestone`。

---

## 7. 阶段 3（P3）：预设 + AI（W4-W5，Tasks 20-27）

**工时估算**：12 人天
**里程碑**：可发 AI（无前端）；worker 跑通；5 辅助接口齐全。

### Task 20：预设项目数据迁移 + API

**Goal**：20 项 preset 写入 `preset_items`；`GET /api/preset/list` 按 category 分组。

**Pre-reqs**：Task 4
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/migrations/1700000000001-SeedPresets.ts`（20 项）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/preset/preset.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/preset/preset.controller.ts`

**Steps**：

1. **写 seed**（v1 的 20 项**一字不改**地迁移到 PG，category=鼻/眼/面/颌/肤，各 4 项）：

```typescript
async up(qr: QueryRunner) {
  const items = [
    { key: 'nose_bridge_lift', category: '鼻部', name: '鼻梁增高', sort_order: 10,
      description: '提升鼻梁高度', default_prompt: 'subtly raise and define the nose bridge, ...' },
    // ... 共 20 项（详见 v1 design §5）
  ];
  for (const it of items) {
    await qr.query(`INSERT INTO preset_items
      (key, category, name, description, default_prompt, credits_cost, is_active, sort_order)
      VALUES ($1,$2,$3,$4,$5,2,true,$6) ON CONFLICT (key) DO NOTHING;`,
      [it.key, it.category, it.name, it.description, it.default_prompt, it.sort_order]);
  }
}
```

> ⭐ 20 项内容与 v1 完全一致，业务未变。

2. **写 `preset.service.ts`**：

```typescript
async list() {
  const all = await this.repo.find({
    where: { is_active: true },
    order: { category: 'ASC', sort_order: 'ASC' },
  });
  return all.reduce((acc, it) => {
    (acc[it.category] ??= []).push(it);
    return acc;
  }, {} as Record<string, PresetItemEntity[]>);
}
```

3. **Commit**：`feat(preset): seed 20 items + grouped list api`

---

### Task 21：AI 提示词拼接器（TDD）

**Goal**：`prompt.js` 纯函数，prefix + presets AND + user_text + suffix。

**Pre-reqs**：Task 12（`prompt_prefix` / `prompt_suffix` 已在 system_configs）
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/prompt.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/prompt.test.ts`（**TDD 红绿**）

**Steps**：

1. **写失败测试**（`prompt.test.ts`）：

```typescript
import { buildPrompt } from './prompt';

describe('buildPrompt', () => {
  it('joins presets with AND', () => {
    expect(buildPrompt('p_', ['a','b','c'], null, '_s'))
      .toBe('p_a AND b AND c_s');
  });
  it('inserts user_text with comma when present', () => {
    expect(buildPrompt('p_', ['a'], 'make brighter', '_s'))
      .toBe('p_a, make brighter_s');
  });
  it('handles single preset without AND', () => {
    expect(buildPrompt('p_', ['a'], null, '_s'))
      .toBe('p_a_s');
  });
  it('preserves empty user_text as no insertion', () => {
    expect(buildPrompt('p_', ['a','b'], '', '_s'))
      .toBe('p_a AND b_s');
  });
  it('escapes commas in user_text? (NO, we trust user input)', () => {
    expect(buildPrompt('p_', ['a'], 'thin, sharp nose', '_s'))
      .toBe('p_a, thin, sharp nose_s');
  });
});
```

跑 → **FAIL**。

2. **实现**：

```typescript
// server/src/ai/prompt.ts
export function buildPrompt(
  prefix: string,
  presetPrompts: string[],
  userText: string | null,
  suffix: string,
): string {
  const joined = presetPrompts.length === 1
    ? presetPrompts[0]
    : presetPrompts.join(' AND ');
  const user = userText && userText.trim()
    ? `, ${userText.trim()}` : '';
  return `${prefix}${joined}${user}${suffix}`;
}
```

跑 → **PASS**。

3. **Commit**：`feat(ai): prompt builder with TDD (5 test cases)`

**Done Criteria**：5 个测试全绿。

---

### Task 22：AI 适配器（mock + tongyi）

**Goal**：`AiAdapter` 接口 + 2 实现：`MockAdapter`（永远成功返 sample 图 URL）+ `TongyiAdapter`（封装通义万相 image editing API）。

**Pre-reqs**：Task 21
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/adapters/ai-adapter.interface.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/adapters/mock.adapter.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/adapters/tongyi.adapter.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/adapters/tongyi.adapter.spec.ts`
- Modify: `/Users/chenjin/Downloads/beautify_work/.env.example`（TONGYI_API_KEY）

**Steps**：

1. **写接口**：

```typescript
// server/src/ai/adapters/ai-adapter.interface.ts
export interface AiAdapter {
  name: 'mock' | 'tongyi' | 'hunyuan';
  async editImage(opts: {
    imageSignedUrl: string;
    prompt: string;
  }): Promise<{ resultBuffer: Buffer; modelUsed: string; costCents: number; latencyMs: number }>;
}
```

2. **写 mock**：直接读 `./test/fixtures/sample-face.jpg` 作为结果。

3. **写 tongyi**（**deferred** 真实调用）：

```typescript
@Injectable()
export class TongyiAdapter implements AiAdapter {
  name = 'tongyi' as const;
  async editImage({ imageSignedUrl, prompt }: any) {
    const start = Date.now();
    // (deferred) 真实环境调 dashscope SDK
    if (this.cfg.get('NODE_ENV') !== 'production') {
      return {
        resultBuffer: await fs.promises.readFile('./test/fixtures/sample-face.jpg'),
        modelUsed: 'wanx-v1-mock', costCents: 5, latencyMs: 1000,
      };
    }
    const res = await axios.post('https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis',
      { model: 'wanx-v1', input: { image_url: imageSignedUrl, prompt },
        parameters: { n: 1 } },
      { headers: { Authorization: `Bearer ${this.cfg.get('TONGYI_API_KEY')}` } });
    const url = res.data.output.results[0].url;
    const buf = await axios.get(url, { responseType: 'arraybuffer' });
    return { resultBuffer: Buffer.from(buf.data), modelUsed: 'wanx-v1',
             costCents: 5, latencyMs: Date.now() - start };
  }
}
```

4. **Commit**：`feat(ai): mock + tongyi adapters with fallback to mock in dev`

**Done Criteria**：mock 单测通过；tongyi dev 环境返 mock，prod 需真 key（deferred）。

---

### Task 23：hunyuan stub + AIService 入口

**Goal**：
- `HunyuanAdapter` 永远抛 `HttpException(501, 'NOT_IMPLEMENTED')`（v2 占位）
- `AIService.generate()`：路由到 primary，失败切 secondary，重试 1 次，**都失败则退积分**

**Pre-reqs**：Task 22
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/adapters/hunyuan.adapter.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/ai.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/ai.service.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/ai.module.ts`

**Steps**：

1. **写 hunyuan stub**：

```typescript
@Injectable()
export class HunyuanAdapter implements AiAdapter {
  name = 'hunyuan' as const;
  async editImage(): Promise<any> {
    throw new HttpException('NOT_IMPLEMENTED', 501);
  }
}
```

2. **写失败测试**（`ai.service.spec.ts`）：
   - primary 成功 → 不调 secondary
   - primary 5xx → 重试 1 次仍败 → 调 secondary（如允许）
   - 两边都败 → 抛错 + 调 ledger.refund

3. **写 `ai.service.ts`**：

```typescript
@Injectable()
export class AiService {
  async generate(generationId: string, userId: string, imageUrl: string, presetKeys: string[], userText: string | null) {
    const cfg = await this.sysCfg.get('ai_models');  // 含 primary/secondary/allow_fallback
    const { prefix, suffix } = await this.loadPromptAffixes();
    const presets = await this.presetRepo.findBy({ key: In(presetKeys) });
    const prompt = buildPrompt(prefix, presets.map(p => p.default_prompt), userText, suffix);

    const signedUrl = await this.oss.signUrl(imageUrl, 300);
    const errors: any[] = [];
    for (const target of [cfg.primary, cfg.secondary]) {
      if (!target?.enabled) continue;
      const adapter = this.adapters.get(target.vendor);
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          return await adapter.editImage({ imageSignedUrl: signedUrl, prompt });
        } catch (e: any) {
          errors.push({ vendor: target.vendor, attempt, msg: e.message });
          if (e.status >= 400 && e.status < 500 && e.status !== 429) break;  // 参数错不重试
        }
      }
    }
    await this.ledger.refund(userId, /* amount */, generationId, 'AI 全部失败');
    await this.generations.update(generationId, { status: 'failed', error_msg: JSON.stringify(errors) });
    throw new InternalServerErrorException({ code: 'AI_FAILED', errors });
  }
}
```

4. **Commit**：`feat(ai): aiservice with hot-swap routing + retry + refund`

**Done Criteria**：5 个测试路径全绿；dev 跑通（mock → 成功）。

---

### Task 24：Redis 限流 + 站内通知

**Goal**：
- 限流：每用户 `per_minute=5`、`per_day=50`、`burst=3`（值从 system_configs 读）
- 通知：建 `notifications` 表已存在；`GET /api/notification/list`（按时间倒序，未读优先）+ `PATCH /:id/read`

**Pre-reqs**：Task 4（notifications 表已建）
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/rate-limiter.ts`（Redis Lua）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/rate-limiter.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/notification/notification.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/notification/notification.controller.ts`

**Steps**：

1. **写限流测试**：
   - 调 5 次 OK，第 6 次返 429
   - 改 `system_configs.rate_limit.per_minute=2` 后，第 3 次 429
2. **写 `rate-limiter.ts`**（Redis Lua 原子计数）：

```lua
-- rate-limit.lua
local per_min = tonumber(ARGV[1])
local cur = redis.call('INCR', KEYS[1])
if cur == 1 then redis.call('EXPIRE', KEYS[1], 60) end
if cur > per_min then return 0 end
return 1
```

```typescript
// server/src/ai/rate-limiter.ts
export async function checkRate(redis: Redis, userId: string, perMin: number) {
  const ok = await redis.eval(LUA, 1, `rl:m:${userId}`, perMin);
  if (ok === 0) throw new HttpException('请求过于频繁', 429);
}
```

3. **写 notification controller**：

```typescript
@Controller('notification')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  @Get('list') list(@CurrentUser() u, @Query() q: ListNotifDto) {
    return this.svc.list(u.id, q);
  }
  @Patch(':id/read')
  read(@CurrentUser() u, @Param('id') id: string) {
    return this.svc.markRead(u.id, id);
  }
}
```

4. **Commit**：`feat(ai): redis lua rate limiter + notification list/read api`

**Done Criteria**：限流单测过；notification list 返分页。

---

### Task 25：Generate submit（50ms 内）+ Worker

**Goal**：
- `POST /api/generate/submit`：JWT → 校验 DTO → 限流 → 算积分 → 事务扣 → 写 generation(pending) → 入 Bull → 50ms 内返 `{generation_id}`
- **Worker 进程**（独立 `src/workers/generate.worker.ts`）：消费队列 → 调 AIService → `sharp` 合成 AI 角标 + 免责水印 → 上传 OSS → 写 generation(success) + notification

**Pre-reqs**：Tasks 14, 21, 22, 23, 24
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/generate/generate.controller.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/generate/generate.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/generate/generate.service.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/workers/generate.worker.ts`（独立入口）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/ai/image-watermark.ts`（sharp 合成）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/oss/oss.service.ts`
- Modify: `/Users/chenjin/Downloads/beautify_work/server/src/app.module.ts`（注册 BullModule）

**Steps**：

1. **写失败测试**（`generate.service.spec.ts`）：mock Bull + ledger + ai service，断言 submit 后 generation 状态=pending 且 ledger 扣了分。

2. **写 `generate.service.ts`**（submit 关键路径）：

```typescript
@Injectable()
export class GenerateService {
  @InjectQueue('ai.generate') private queue: Queue;

  async submit(userId: string, dto: SubmitDto) {
    const cfg = await this.sysCfg.get('credit_pricing_table');
    const cost = this.calcCost(dto.preset_keys.length, cfg);  // 2/3/4/5
    const generation = await this.dataSource.transaction(async (em) => {
      const u = await em.findOne(UserEntity, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      if (u.credits < cost) throw new BadRequestException({ code: 'INSUFFICIENT_CREDITS' });
      u.credits -= cost;
      await em.save(u);
      const g = em.create(GenerationEntity, {
        user_id: userId, original_url: dto.image_url, preset_keys: dto.preset_keys,
        prompt_text: '', credits_cost: cost, status: 'pending',
        expires_at: new Date(Date.now() + 30 * 86400_000),
      });
      return em.save(g);
    });
    // 流水账
    await this.ledger.appendConsume(userId, cost, 'generate', generation.id);
    await this.queue.add('edit', { generationId: generation.id, userId, ...dto });
    return { generation_id: generation.id };
  }
}
```

3. **写 worker**（独立进程入口 `src/workers/generate.worker.ts`）：

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('ai.generate')
export class GenerateProcessor extends WorkerHost {
  async process(job: Job) {
    const { generationId, userId, imageUrl, presetKeys, text } = job.data;
    try {
      const result = await this.ai.generate(generationId, userId, imageUrl, presetKeys, text);
      const watermarked = await this.watermark.add(result.resultBuffer);
      const resultUrl = await this.oss.upload(`gen/${generationId}.jpg`, watermarked);
      await this.gensRepo.update(generationId, {
        status: 'success', result_url: resultUrl, model_used: result.modelUsed,
      });
      await this.notif.create(userId, 'generation_done',
        '生成完成', `查看您的 AI 预览图`, { generation_id: generationId });
      await this.aiLogs.logSuccess({ generationId, model: result.modelUsed, cost: result.costCents, latency: result.latencyMs });
    } catch (e) {
      await this.aiLogs.logFailure({ generationId, error: e.message });
      throw e;  // 队列重试
    }
  }
}
```

4. **写 `image-watermark.ts`**（sharp）：

```typescript
@Injectable()
export class WatermarkService {
  async add(buf: Buffer): Promise<Buffer> {
    const img = sharp(buf);
    const { width, height } = await img.metadata();
    const svg = Buffer.from(`
      <svg width="${width}" height="${height}">
        <text x="20" y="${height - 30}" font-size="22" fill="rgba(255,255,255,0.85)" stroke="rgba(0,0,0,0.4)" stroke-width="0.5">
          AI 模拟预览，仅供娱乐参考，不构成医疗建议
        </text>
        <rect x="${width - 110}" y="${height - 60}" width="90" height="40" fill="rgba(212,165,160,0.9)" rx="6"/>
        <text x="${width - 95}" y="${height - 33}" font-size="20" fill="white">AI 生成</text>
      </svg>
    `);
    return img.composite([{ input: svg, top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer();
  }
}
```

5. **Commit**：`feat(generate): submit + worker with watermark + oss upload + notification`

**Done Criteria**：
- `POST /api/generate/submit` 50ms 内返 `{generation_id}`
- worker 跑通（dev 走 mock adapter），看到 notifications 表有 1 条
- 失败路径 → ledger 退积分 + generation=failed

---

### Task 26：Generate 5 辅助接口

**Goal**：
- `GET /api/generate/status/:id`（轮询降级用，返 status + result_url if success）
- `GET /api/generate/list`（我的历史，分页 + status 过滤）
- `GET /api/generate/:id`（详情）
- `DELETE /api/generate/:id`（软删，status=deleted）
- `GET /api/generate/:id/download-url`（OSS 临时签名 URL，TTL 5min）

**Pre-reqs**：Task 25
**Files**：
- Modify: `/Users/chenjin/Downloads/beautify_work/server/src/generate/generate.controller.ts`（追加 5 端点）
- Modify: `/Users/chenjin/Downloads/beautify_work/server/src/generate/generate.service.ts`（追加方法）

**Steps**：

1. **写失败测试**（每个端点 1 个用例）
2. **写 5 方法**：

```typescript
async status(userId, id) {
  const g = await this.gensRepo.findOne({ where: { id, user_id: userId } });
  return { id: g.id, status: g.status, result_url: g.status === 'success' ? g.result_url : null };
}

async list(userId, page, size, statusFilter) {
  return this.gensRepo.findAndCount({
    where: { user_id: userId, ...(statusFilter && { status: statusFilter }) },
    order: { created_at: 'DESC' }, skip: (page - 1) * size, take: size,
  });
}

async detail(userId, id) { /* + ai_logs 摘要 */ }
async delete(userId, id) { await this.gensRepo.update({ id, user_id: userId }, { status: 'deleted' }); }
async downloadUrl(userId, id) {
  const g = await this.gensRepo.findOneOrFail({ where: { id, user_id: userId } });
  if (g.status !== 'success') throw new BadRequestException('生成未成功');
  const url = await this.oss.signUrl(g.result_url, 300);
  await this.downloadLogs.log(userId, id);  // 合规
  return { url, expires_in: 300 };
}
```

3. **Commit**：`feat(generate): status/list/detail/delete/download-url endpoints`

---

### Task 27：P3 验收

**Acceptance Checklist**：

- [ ] 20 项 preset 写入 DB
- [ ] `GET /api/preset/list` 按 5 类分组
- [ ] 5 个 prompt 测试全绿
- [ ] submit 接口 50ms 内返（用 `time` 命令测）
- [ ] worker 跑通：mock → 角标 + 通知
- [ ] 失败路径：mock 改成 throw → ledger 退 + gen=failed
- [ ] 限流：调 6 次 submit 第 6 次 429
- [ ] 5 辅助接口 200 + 数据正确
- [ ] Runbook 20-26 状态全 ⏳ → ✅

**Done Criteria**：commit `chore(release): p3 milestone`。

---

## 8. 阶段 4（P4）：咨询师端页面（W6-W7，Tasks 28-31）

**工时估算**：6 人天
**里程碑**：11 个 Vue 页面全部联通，可发完整业务流（登录 → 充值 → 生成 → 看结果 → 注销）。

### Task 28：登录 + 工作台 + 我的 + 通知 4 页

**Goal**：4 个核心页面跑通。

**Pre-reqs**：Tasks 6, 10, 11
**Files**（全部在 `/Users/chenjin/Downloads/beautify_work/web/src/pages/`）：
- Create: `Login.vue`（手机号 + 验证码 + 协议勾选 + @click 跳 dashboard）
- Create: `Dashboard.vue`（用户卡片 + 积分余额 + 2 大按钮（去生成/去充值）+ 最近 3 张生成）
- Create: `Profile.vue`（头像昵称 + 积分明细跳历史 + 设置 + 协议 + 注销确认弹窗）
- Create: `Notifications.vue`（list 卡片，未读红点 + 标记已读）

**Steps**：

1. **写 Pinia stores**（`stores/user.ts`、`stores/notification.ts`）
2. **写 Login.vue** 关键逻辑：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { showToast } from 'vant';
import { useUserStore } from '@/stores/user';
import { sendSms, login } from '@/api/auth';

const phone = ref('');
const code = ref('');
const countdown = ref(0);
const user = useUserStore();
const router = useRouter();

async function onSend() {
  if (countdown.value > 0) return;
  await sendSms(phone.value);
  countdown.value = 60;
  const t = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) clearInterval(t);
  }, 1000);
}

async function onLogin() {
  const res = await login(phone.value, code.value);
  user.setToken(res.token);
  user.setRefreshToken(res.refresh_token);
  user.setUser(res.user);
  router.push('/dashboard');
}
</script>
```

3. **写 Dashboard.vue** 关键布局：

```vue
<template>
  <div class="dashboard">
    <van-card :title="user.nickname" :thumb="user.avatar" />
    <div class="credits">余额：{{ user.credits }} 积分</div>
    <van-grid :column-num="2" gutter="10">
      <van-grid-item icon="photo-o" text="去生成" to="/generate" />
      <van-grid-item icon="balance-o" text="去充值" to="/recharge" />
    </van-grid>
    <h3>最近生成</h3>
    <van-grid :column-num="3">
      <van-grid-item v-for="g in recent" :key="g.id">
        <img :src="g.result_url" alt="" />
      </van-grid-item>
    </van-grid>
  </div>
</template>
```

4. **Profile.vue + Notifications.vue** 类似实现（详见 runbook）
5. **Commit**：`feat(web): login + dashboard + profile + notifications pages`

**Done Criteria**：浏览器手测四页跳得通、数据正确；响应式断点 mixin 在 desktop 上自动隐藏 Vant 的 mobile-only 元素。

---

### Task 29：生成 + 生成中 + 结果 3 页

**Goal**：核心业务三步走通。

**Pre-reqs**：Task 28（dashboard 跳得通）、Task 25（submit 接口）
**Files**：
- Create: `Generate.vue`（上传原图 + 多选 preset + 描述 + 实时显示积分价 + 提交）
- Create: `Generating.vue`（loading + 轮询 status + "完成后通知" 提示 + 取消）
- Create: `Result.vue`（左右滑对比 + 下载 + 反馈）

**Steps**：

1. **写 Generate.vue**：

```vue
<template>
  <div>
    <van-uploader v-model="file" :max-count="1" :after-read="upload" />
    <van-checkbox-group v-model="selectedPresets">
      <van-cell-group v-for="(items, cat) in presets" :title="cat" :key="cat">
        <van-checkbox v-for="p in items" :key="p.key" :name="p.key">
          {{ p.name }} <span class="cost">+{{ costOf(p) }}积分</span>
        </van-checkbox>
      </van-cell-group>
    </van-checkbox-group>
    <van-field v-model="text" placeholder="可选：补充描述" type="textarea" rows="3" />
    <div class="price">合计：{{ totalCost }} 积分</div>
    <van-button block :disabled="!file || !selectedPresets.length" @click="submit">
      提交（扣 {{ totalCost }} 积分）
    </van-button>
  </div>
</template>
```

2. **写 Generating.vue**（轮询）：

```vue
<script setup>
const route = useRoute();
const router = useRouter();
const id = route.params.id;
const status = ref('pending');
const timer = ref();

onMounted(() => {
  timer.value = setInterval(async () => {
    const r = await getStatus(id);
    status.value = r.status;
    if (r.status === 'success') { clearInterval(timer.value); router.push(`/result/${id}`); }
    if (r.status === 'failed') { clearInterval(timer.value); showDialog({ title: '生成失败', message: '积分已退还' }); }
  }, 3000);
});
onUnmounted(() => clearInterval(timer.value));
</script>
```

3. **写 Result.vue**：左右滑对比用 `vue-compare-image` 组件；下载调 `getDownloadUrl` 拿 OSS 签名链接。
4. **Commit**：`feat(web): generate + generating + result pages with polling`

**Done Criteria**：浏览器手动跑"上传 → 选 preset → 提交 → 等 mock worker 跑完 → 看到结果图带角标"，全程 < 1min。

---

### Task 30：历史 + 充值 + 订单详情 + 协议 4 页

**Goal**：剩余 4 页。

**Pre-reqs**：Tasks 14, 15, 12
**Files**：
- Create: `History.vue`（缩略图 grid + 状态过滤 + 跳详情）
- Create: `Recharge.vue`（4 档套餐卡片 + 协议勾选 + 调起支付）
- Create: `OrderDetail.vue`（订单号、金额、状态、时间、复制按钮）
- Create: `Agreement.vue`（长文本 + 滚动到底部才能点"同意"）

**Steps**：

1. **写 Recharge.vue**：

```vue
<van-radio-group v-model="pkg">
  <van-cell-group>
    <van-cell v-for="p in packages" :key="p.id" clickable @click="pkg = p.id">
      <template #title>{{ p.name }} ({{ p.credits + p.bonus_credits }}积分)</template>
      <template #right-icon>
        <van-radio :name="p.id" />
        <span class="price">¥{{ (p.price_cents/100).toFixed(2) }}</span>
      </template>
    </van-cell>
  </van-cell-group>
</van-radio-group>
<van-button @click="pay('wechat')">微信支付</van-button>
<van-button @click="pay('alipay')">支付宝</van-button>
```

2. **写 Agreement.vue**（必须滚到底才能点同意）：

```vue
<script setup>
const scrolledToBottom = ref(false);
function onScroll(e) {
  if (e.target.scrollTop + e.target.clientHeight >= e.target.scrollHeight - 5) {
    scrolledToBottom.value = true;
  }
}
</script>
<template>
  <div class="agreement" @scroll="onScroll">
    <div v-html="content" />
  </div>
  <van-button :disabled="!scrolledToBottom" @click="onAccept">同意</van-button>
</template>
```

3. **Commit**：`feat(web): history + recharge + order-detail + agreement pages`

---

### Task 31：P4 验收

**Acceptance Checklist**：

- [ ] 11 个页面无 404、无 console error
- [ ] 浏览器响应式：在 375px / 768px / 1280px 三个断点测过布局
- [ ] 完整业务流：手机号登录 → 充值 50 积分 → 选 1 预设生成 → 看到结果带角标 → 历史列表可见 → 注销账号
- [ ] Vant 4 / Element Plus 组件按需加载（首屏 < 300KB gzip）
- [ ] Lighthouse Mobile Performance > 80
- [ ] Runbook 28-30 状态全 ⏳ → ✅

**Done Criteria**：commit `chore(release): p4 milestone` + 截图存 `docs/p4-screenshots/`。

---

## 9. 阶段 5（P5）：运营后台（W8-W9，Tasks 32-35）

**工时估算**：7 人天
**里程碑**：运营可上线管理（改预设、调套餐、查 AI 日志、处理退款）。

### Task 32：后台登录 + 鉴权 + 路由守卫

**Goal**：admin 登录 + JWT + 路由守卫。

**Pre-reqs**：Task 7、Task 4（admin_users 表已建）
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/admin/auth/admin-auth.controller.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/admin/auth/admin-auth.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/admin/jwt.strategy.ts`（admin 专用）
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/admin/auth/admin-auth.service.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/admin/src/stores/auth.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/admin/src/pages/Login.vue`
- Create: `/Users/chenjin/Downloads/beautify_work/admin/src/api/auth.ts`

**Steps**：

1. **写 admin auth service**（bcrypt 校验 + 签 admin JWT）：

```typescript
@Injectable()
export class AdminAuthService {
  async login(username: string, password: string) {
    const u = await this.repo.findOne({ where: { username } });
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      throw new UnauthorizedException('账号或密码错误');
    }
    u.last_login_at = new Date();
    await this.repo.save(u);
    return {
      token: await this.jwt.signAsync(
        { sub: u.id, type: 'admin', role: u.role },
        { expiresIn: '4h' },
      ),
      admin: { id: u.id, username: u.username, role: u.role },
    };
  }
}
```

2. **写 admin Login.vue**（用户名 + 密码 + 强制改密弹窗 if 首次登录）
3. **路由守卫**（Task 7 写过，复用）
4. **seed 默认 admin**：

```sql
INSERT INTO admin_users (username, password_hash, role) VALUES
  ('admin', '$2b$10$...bcrypt of "admin123"', 'super')
ON CONFLICT (username) DO NOTHING;
```

5. **Commit**：`feat(admin): login + jwt + route guard + default admin seed`

**Done Criteria**：浏览器 `localhost:5174/admin/login` 输入 admin/admin123 → 跳 dashboard。

---

### Task 33：5 模块（dashboard / orders / users / presets / packages）

**Goal**：基础 5 模块。

**Pre-reqs**：Tasks 32, 4, 15
**Files**（按模块拆 controller + page）：
- `/server/src/admin/dashboard/`、`/admin/src/pages/Dashboard.vue`
- `/server/src/admin/orders/`、`/admin/src/pages/Orders.vue`
- `/server/src/admin/users/`、`/admin/src/pages/Users.vue`
- `/server/src/admin/presets/`、`/admin/src/pages/Presets.vue`
- `/server/src/admin/packages/`、`/admin/src/pages/Packages.vue`

**Steps**（每模块相同节奏）：

1. **写后端**（举例 orders）：

```typescript
@Controller('admin/orders')
@UseGuards(AdminAuthGuard, RolesGuard)
export class AdminOrdersController {
  @Get() list(@Query() q: ListOrdersDto) {
    return this.svc.list(q);
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.svc.detail(id);
  }
}
```

2. **写前端**（用 Element Plus `el-table` + `el-pagination`）：

```vue
<template>
  <el-table :data="rows" stripe>
    <el-table-column prop="order_no" label="订单号" />
    <el-table-column prop="amount_cents" label="金额(分)" />
    <el-table-column prop="status" label="状态" />
    <el-table-column prop="created_at" label="创建时间" />
  </el-table>
  <el-pagination v-model:current-page="page" :page-size="20" :total="total" @current-change="load" />
</template>
```

3. **Dashboard.vue**（4 KPI + 7 日趋势 + 套餐占比 + 待处理）：

```vue
<el-row :gutter="20">
  <el-col v-for="k in kpis" :key="k.label" :span="6">
    <el-card><div class="kpi">{{ k.label }}<div class="num">{{ k.value }}</div></div></el-card>
  </el-col>
</el-row>
<el-chart :option="trendOption" />
```

4. **Commit**：`feat(admin): dashboard/orders/users/presets/packages modules`

**Done Criteria**：5 模块可查询、可翻页；Dashboard 4 KPI 数据正确。

---

### Task 34：4 模块（configs / refunds / ai-logs / audit-logs）

**Goal**：剩余 4 模块。

**Pre-reqs**：Task 33
**Files**：
- `/server/src/admin/configs/`、`/admin/src/pages/Configs.vue`
- `/server/src/admin/refunds/`、`/admin/src/pages/Refunds.vue`
- `/server/src/admin/ai-logs/`、`/admin/src/pages/AILogs.vue`
- `/server/src/admin/audit-logs/`、`/admin/src/pages/AuditLogs.vue`

**Steps**：

1. **Configs.vue**（KV 编辑器，按 key 列表，点击编辑 → JSON 弹窗 → 保存）：

```vue
<el-table :data="configs">
  <el-table-column prop="key" label="Key" />
  <el-table-column label="Value">
    <template #default="{ row }">
      <el-button @click="edit(row)">{{ truncate(row.value) }}</el-button>
    </template>
  </el-table-column>
  <el-table-column prop="updated_at" label="更新时间" />
</el-table>
```

2. **Refunds.vue**（申请列表 + 通过/拒绝 + 调起原路退款 API）：

```typescript
@Post(':id/approve') approve(@Param('id') id: string) {
  return this.svc.approve(id);  // 内部：order → refund API → ledger.refund
}
@Post(':id/reject') reject(@Param('id') id: string, @Body() body: { reason: string }) {
  return this.svc.reject(id, body.reason);
}
```

3. **AILogs.vue**（列表 + 失败明细侧边栏）
4. **AuditLogs.vue**（所有运营操作流水）
5. **Commit**：`feat(admin): configs/refunds/ai-logs/audit-logs modules`

---

### Task 35：P5 验收

**Acceptance Checklist**：

- [ ] admin 登录、token 持久化
- [ ] 9 模块路由可访问，无 404
- [ ] 改 preset → 前端用户端 `GET /api/preset/list` 立即生效（5 分钟内热加载）
- [ ] 改套餐 → 充值页显示新套餐
- [ ] 退款申请 → approve → ledger refund + 状态=approved
- [ ] Runbook 32-34 状态全 ⏳ → ✅

**Done Criteria**：commit `chore(release): p5 milestone`。

---

## 10. 阶段 6（P6）：收尾（W10，Tasks 36-38）

**工时估算**：6 人天
**里程碑**：v2.0 GA 上线。

### Task 36：监控告警

**Goal**：`@willsoto/nestjs-prometheus` 暴露 `/metrics`，Grafana dashboard 4 个面板，企业微信 webhook 4 类告警。

**Pre-reqs**：Task 3
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/metrics/metrics.module.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/metrics/metrics.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/server/src/common/notify/wechat-bot.service.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/prometheus.yml`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/grafana-dashboards/main.json`
- Modify: `/Users/chenjin/Downloads/beautify_work/docker-compose.yml`（加 prometheus + grafana 服务）

**Steps**：

1. **写 metrics module**：

```typescript
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
```

2. **4 个核心指标**：
   - `http_requests_total{method,route,status}`
   - `ai_call_latency_seconds{model,success}`（histogram）
   - `credit_operations_total{type}`（counter）
   - `active_users_24h`（gauge）

3. **写告警规则**（prometheus.yml）：

```yaml
groups:
- name: mae_alerts
  rules:
  - alert: HighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
    for: 5m
    annotations: { summary: "5xx 错误率 > 5%" }
  - alert: AiFailureHigh
    expr: rate(ai_call_latency_seconds_count{success="false"}[10m]) > 0.15
    for: 10m
    annotations: { summary: "AI 失败率 > 15%" }
  - alert: CreditLedgerMismatch
    expr: ...
    annotations: { summary: "积分账不平" }
  - alert: DiskSpaceLow
    expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
    annotations: { summary: "磁盘空间 < 10%" }
```

4. **写 webhook**：

```typescript
async notify(text: string) {
  const url = this.cfg.get('WECHAT_BOT_WEBHOOK');
  if (!url) return;
  await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'markdown', markdown: { content: text } }),
  });
}
```

5. **Commit**：`feat(monitor): prometheus + grafana + wechat webhook alerts`

**Done Criteria**：`curl http://localhost:3000/metrics` 返 prometheus 格式；4 个告警规则文件就位。

---

### Task 37：E2E 测试 + CI/CD

**Goal**：
- **Playwright** 4 主流程 E2E：登录/充值/生成/历史
- **GitHub Actions** CI：lint + test + build + docker push

**Pre-reqs**：Tasks 28, 29, 30
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/tests/e2e/playwright.config.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/tests/e2e/01-login.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/tests/e2e/02-recharge.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/tests/e2e/03-generate.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/tests/e2e/04-history.spec.ts`
- Create: `/Users/chenjin/Downloads/beautify_work/.github/workflows/ci.yml`
- Create: `/Users/chenjin/Downloads/beautify_work/.github/workflows/deploy-prod.yml`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/server.Dockerfile`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/worker.Dockerfile`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/web.Dockerfile`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/admin.Dockerfile`

**Steps**：

1. **装 Playwright**：

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps chromium
```

2. **写 E2E 01-login.spec.ts**：

```typescript
import { test, expect } from '@playwright/test';
test('user can login via phone code', async ({ page, request }) => {
  // 1. 触发发短信，从 dev 日志里拿 code（用 fetch 调 mock）
  await request.post('/api/auth/sms/send', { data: { phone: '13800138000' } });
  const code = await getLatestDevCode();  // 从 dev server 日志
  // 2. 浏览器登录
  await page.goto('/login');
  await page.fill('[data-test=phone]', '13800138000');
  await page.fill('[data-test=code]', code);
  await page.click('[data-test=submit]');
  await expect(page).toHaveURL(/\/dashboard/);
});
```

3. **03-generate.spec.ts**（重点）：走通"上传 → 选 1 预设 → 提交 → 轮询 → 看到 result_url"

4. **写 CI**（`.github/workflows/ci.yml`）：

```yaml
name: CI
on: [push, pull_request]
jobs:
  lint-test-build:
    runs-on: ubuntu-latest
    services:
      postgres: { image: postgres:16, env: { POSTGRES_USER: mae, POSTGRES_PASSWORD: pwd, POSTGRES_DB: mae_test },
                   ports: ['5432:5432'], options: --health-cmd pg_isready --health-interval 5s }
      redis: { image: redis:7, ports: ['6379:6379'] }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: cp server/.env.example server/.env
      - run: npm ci
      - run: npx typeorm migration:run -d migrations/data-source.ts
      - run: npm run lint
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - run: npm run build  # server + web + admin 三套 build
```

5. **写 deploy-prod.yml**（**deferred** 真实镜像推送 + ECS 部署）：

```yaml
name: Deploy Prod
on:
  push: { branches: [main], paths: ['server/**', 'web/**', 'admin/**'] }
jobs:
  push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aliyun/acr-login@v1
        with: { registry: ${{ secrets.ACR_REGISTRY }}, username: ${{ secrets.ACR_USER }} }
      - run: docker build -f docker/server.Dockerfile -t $REGISTRY/mae-server:${{ github.sha }} .
      - run: docker push $REGISTRY/mae-server:${{ github.sha }}
      # (deferred) SSH 到 ECS 拉镜像重启
```

6. **Commit**：
- `test(e2e): playwright 4 main flows`
- `ci: github actions lint+test+build+docker-push`

**Done Criteria**：本地 `npx playwright test` 4 个 spec 全绿；CI 跑通；deferred 项（真实推送）有 TODO 注释。

---

### Task 38：部署 + 发布

**Goal**：生产 docker-compose + nginx 反代 + 备份策略 + v2.0 GA。

**Pre-reqs**：Task 37
**Files**：
- Create: `/Users/chenjin/Downloads/beautify_work/docker-compose.prod.yml`
- Create: `/Users/chenjin/Downloads/beautify_work/docker/nginx.conf`
- Create: `/Users/chenjin/Downloads/beautify_work/scripts/backup-pg.sh`
- Create: `/Users/chenjin/Downloads/beautify_work/scripts/restore-pg.sh`
- Modify: `/Users/chenjin/Downloads/beautify_work/README.md`（更新到 v2.0 文案）

**Steps**：

1. **写 `docker-compose.prod.yml`**（6 服务）：

```yaml
version: '3.9'
services:
  web:
    image: $REGISTRY/mae-web:$TAG
    restart: always
  admin:
    image: $REGISTRY/mae-admin:$TAG
    restart: always
  server:
    image: $REGISTRY/mae-server:$TAG
    env_file: .env.prod
    restart: always
    depends_on: [postgres, redis]
  worker:
    image: $REGISTRY/mae-worker:$TAG
    command: node dist/workers/generate.worker.js
    env_file: .env.prod
    restart: always
    depends_on: [postgres, redis]
  postgres: { image: postgres:16-alpine, volumes: ['pgdata:/var/lib/postgresql/data'], restart: always }
  redis: { image: redis:7-alpine, restart: always }
  nginx:
    image: nginx:alpine
    ports: ['80:80', '443:443']
    volumes: ['./docker/nginx.conf:/etc/nginx/nginx.conf', './certs:/etc/nginx/certs']
    depends_on: [web, admin, server]
volumes: { pgdata: {} }
```

2. **写 `nginx.conf`**（关键路由）：

```nginx
server {
  listen 443 ssl;
  server_name h5.mae.example.com;
  # ...ssl cert
  location / { root /usr/share/nginx/web; try_files $uri $uri/ /index.html; }
  location /api/ { proxy_pass http://server:3000; proxy_set_header Authorization $http_authorization; }
  location /socket.io/ { proxy_pass http://server:3000; }
}
server {
  listen 443 ssl;
  server_name admin.mae.example.com;
  location / { root /usr/share/nginx/admin; try_files $uri $uri/ /index.html; }
  location /api/ { proxy_pass http://server:3000; }
}
```

3. **写 `backup-pg.sh`**（每日 cron）：

```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec mae_pg pg_dump -U mae -d mae_prod | gzip > /backup/mae_${TIMESTAMP}.sql.gz
# 保留 7 天
find /backup -name "mae_*.sql.gz" -mtime +7 -delete
# (deferred) 上传 OSS
```

4. **写 v2.0 release runbook**（陈工执行）：

```bash
# 1. (deferred) SSH 到 ECS
ssh ecs-user@prod-server
# 2. (deferred) 拉新镜像
docker-compose -f docker-compose.prod.yml pull
# 3. (deferred) 跑 migration
docker-compose -f docker-compose.prod.yml run --rm server npx typeorm migration:run
# 4. 重启
docker-compose -f docker-compose.prod.yml up -d
# 5. 冒烟测试
curl https://h5.mae.example.com/api/health
# 6. (deferred) 灰度 10% 流量（用 nginx upstream weight）
# 7. 全量
```

5. **更新 README.md**：

```markdown
# 医美咨询 AI 预览 H5 网页

> 医美咨询师专用工具，上传客户照片 + AI 生成整形预览，按次积分计费。

## 技术栈

- 前端：Vue 3 + Vite + Vant 4（用户端）/ Element Plus（运营后台）
- 后端：NestJS 11 + TypeORM + PostgreSQL 16 + Redis 7 + Bull 队列
- 部署：Docker Compose + 阿里云 ECS

## 开发

\`\`\`bash
docker-compose up -d
cd server && npm run start:dev
cd web && npm run dev
cd admin && npm run dev
\`\`\`

## 部署

详见 `docs/deploy.md` 与 GitHub Actions workflow。
```

6. **Commit**：`docs: v2.0 release notes + deploy scripts + backup`

**Done Criteria**：
- `docker-compose.prod.yml` 语法 `docker-compose config` 通过
- `nginx.conf` 语法 `nginx -t` 通过
- backup script 手动跑一次成功
- README 更新
- Runbook 所有 38 任务 ✅

**v2.0 GA 上线** ⭐

---

## 11. 风险与缓解

| # | 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|---|
| **R1** | **AI 厂商 API 变更/下线**：通义万相 v1 改版或停服 | 中 | 高 | 适配器抽象 + 路由热切换（Task 23）；备用厂商为腾讯混元（v2 stub）；监控 AI 失败率告警（Task 36）|
| **R2** | **支付沙箱/证书**：dev 沙箱调通但 prod 回调失败 | 高 | 高 | **Task 16/17/18 全有 (deferred) 标记**；先 mock 上线，证书到位后再切真实；建议 prod 上线前 1 周做支付全链路演练 |
| **R3** | **PG 性能瓶颈**：高并发下 `pessimistic_write` 行锁成串行 | 中 | 中 | Task 14 用悲观锁保一致；后续可改乐观锁 + 重试；监控 `pg_stat_activity` 长事务 |
| **R4** | **浏览器兼容**：iOS Safari 14 / Android WebView 95 < 老系统不支持某些 API | 中 | 中 | Task 6/28-30 全用 Vant（移动端覆盖好）+ PostCSS autoprefixer；E2E 用 Playwright 跨浏览器矩阵 |
| **R5** | **OSS 跨域/防盗链**：用户下载图时 CORS 报错 | 低 | 中 | Task 26 用签名 URL（TTL 5min）规避；OSS bucket policy 设允许 referer |
| **R6** | **短信发送失败/限流**：阿里云短信 QPS 限制 | 中 | 中 | Task 9 IP/手机号双重限流 + Redis 60s 冷却；告警（失败率 > 5%）；考虑备用通道（腾讯云）|
| **R7** | **并发扣积分竞态**：用户连点 2 次 submit | 高 | 高 | Task 14/25 全用 `pessimistic_write` 行锁 + `synchronize:false`；Task 24 限流先卡（每分钟 5 次）；E2E 模拟并发 |
| **R8** | **AI 合成水印 sharp 内存**：高分辨率图合成 OOM | 中 | 中 | Task 25 sharp 流式 pipe + 限制输入 < 4096px；监控 worker 进程 RSS；OOM 告警（Task 36）|
| **R9** | **AI 生成违规内容**：违反国内法规 | 中 | 高 | Design §6.6 + Task 22 已规划 aliyun-green 审核（**deferred**，v2.1 实现）；v2 先做"用户协议免责 + 角标"应对；建立举报通道 |
| **R10** | **数据库迁移破坏数据**：生产跑 migration 失败 | 低 | 高 | Task 4 用 TypeORM migration 双向（up + down）；部署 runbook 强制 backup-pg 之后才 migrate；migration 必须测试环境先跑 1 周 |

### 11.1 风险跟进节奏

- **W2 末**：R7（并发扣积分）端到端压测
- **W5 末**：R1（AI 厂商）实际联调；R3（PG 性能）压测
- **W8 末**：R2（支付）真实环境演练
- **W10 末**：R4 / R5 / R6 / R9 全链路 E2E 演练 + 灰度

---

## 12. 文档索引

| 文档 | 路径 | 用途 |
|---|---|---|
| 设计终稿 | `/Users/chenjin/Downloads/beautify_work/docs/superpowers/specs/2026-06-04-医美咨询H5-design.md` | 业务模型、API、数据表、决策 |
| 实施计划（本文档） | `/Users/chenjin/Downloads/beautify_work/docs/superpowers/plans/2026-06-04-医美咨询H5-implementation.md` | 阶段、38 任务、TDD 节奏、提交规范 |
| 执行 Runbook | `/Users/chenjin/Downloads/beautify_work/docs/superpowers/execution/2026-06-04-医美咨询H5-runbook.md` | 逐步骤、可直接复制粘贴 |
| API 契约 | `/Users/chenjin/Downloads/beautify_work/server/openapi.yaml` | Swagger 自动生成 |
| 上一版（废弃） | `/Users/chenjin/Downloads/beautify_work/docs/superpowers/specs/2026-06-04-医美咨询小程序-design.md` | 业务内容参考 |

---

## 13. 变更记录

| 日期 | 版本 | 变更 |
|---|---|---|
| 2026-06-04 | v2.0 | 全新文档（小程序 → H5 重构） |
| 2026-06-04 | v1.0 | 已废弃，保留作业务参考 |

---

*Plan v2.0 — H5 + NestJS + PostgreSQL, 2026-06-04*
