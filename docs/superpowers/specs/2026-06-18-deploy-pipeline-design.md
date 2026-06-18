# GitHub push → 阿里云 ACR → 阿里云 ECS 自动部署方案

> 文档日期：2026-06-18
> 状态：设计稿，待实施

## Context

当前项目已有 `.github/workflows/deploy.yml`，会在 `push` 到 `feature/h5-redesign` 分支后 SSH 到 ECS 执行 `git pull` + `docker compose up -d --build`。问题：

1. **每次部署都要在 ECS 上 `npm ci` + `vite build` / `nest build`**，完整构建 5–10 分钟，浪费服务器 CPU。
2. **未跑通**：用户表示 secrets / 镜像仓库 / 迁移 等环节还没接好。
3. **没有镜像版本管理**：每次都是最新代码就地构建，回滚只能 git checkout。
4. **没有数据库迁移步骤**：`synchronize: false` 模式下 TypeORM 不会自动建表，新加 entity 部署后会报错。

目标：**改造成 GitHub Actions 构建镜像推送到阿里云 ACR，ECS 拉镜像 + 跑迁移 + 起服务**，全程无需在 ECS 上重新 `npm install`。

---

## 架构对比

### 改造前（现状）

```
push → GitHub Actions CI(测试) → SSH ECS
     → ECS git pull
     → ECS docker compose up --build  ← 每次重新 npm ci + nest build + vite build
     → ECS 起服务（无迁移步骤）
```

### 改造后

```
push → GitHub Actions CI(测试)
     → GitHub Actions 构建 3 个镜像(web/admin/server)
     → 推送至阿里云 ACR (registry.<region>.aliyuncs.com/beautify-work/*)
     → SSH ECS
       ├─ docker login ACR
       ├─ docker compose pull (拉新镜像)
       ├─ docker compose run --rm migrate (跑 TypeORM 迁移)
       ├─ docker compose up -d (起服务)
       ├─ curl /api/health 健康检查
       └─ docker image prune (清理旧镜像)
```

部署耗时：ECS 侧从 ~10 min 降到 ~30s（拉镜像 + 跑迁移 + 起服务）。

---

## 实施步骤

### 1. 一次性：阿里云控制台

#### 1.1 创建 ACR 个人版实例

- 入口：阿里云控制台 → 容器镜像服务 ACR → 个人版 → 创建实例
- **地域选择与 ECS 一致**（如 ECS 在华东1(杭州)，ACR 也选 cn-hangzhou）
- 命名空间：`beautify-work`
- 在该命名空间下创建 3 个仓库：
  - `web`（公开/私有均可，私有更安全）
  - `admin`（私有）
  - `server`（私有）
- ACR 个人版默认配额足够（300 仓库、免费）

#### 1.2 设置 ACR 访问密码

- ACR 个人版 → 访问凭证 → 设置固定密码（不是阿里云账号密码）
- **保存**：用户名 + 密码，后续填到 GitHub Secrets

#### 1.3 记录需要的元数据

- `ACR_REGION`（如 `cn-hangzhou`）
- `ACR_NAMESPACE`（`beautify-work`）
- `ACR_USERNAME`（阿里云账号全名）
- `ACR_PASSWORD`（1.2 设的密码）

### 2. 一次性：ECS 服务端

#### 2.1 确保目录与 .env 存在

```bash
# 假设项目已在 /opt/medical-aesthetics
cd /opt/medical-aesthetics

# .env 不进 git，保留现有生产配置
# 确认 .env 存在且与 .env.example 一致（除真实密钥外）
ls -la .env
```

#### 2.2 首次手动拉镜像测试（可选）

如果 ECS 上还没有 ACR 登录，先在 ECS 上手动登录一次：

```bash
docker login registry.cn-hangzhou.aliyuncs.com -u <用户名>
# 输入 1.2 设的密码
```

### 3. 一次性：GitHub Secrets

仓库 Settings → Secrets and variables → Actions → New repository secret，添加：

| Secret 名 | 值 | 说明 |
|---|---|---|
| `ECS_HOST` | `<ECS 公网 IP>` | 已有，保留 |
| `ECS_USER` | `root` 或 `deploy` | 已有，保留 |
| `ECS_SSH_KEY` | SSH 私钥全文 | 已有，保留 |
| `ACR_REGION` | `cn-hangzhou` | 新增 |
| `ACR_NAMESPACE` | `beautify-work` | 新增 |
| `ACR_USERNAME` | 阿里云账号全名 | 新增 |
| `ACR_PASSWORD` | ACR 访问密码 | 新增 |
| `DEPLOY_BRANCH` | `feature/h5-redesign` | 新增（可选，便于以后改分支） |

### 4. 代码改动

#### 4.1 新建 `server/src/migrate.ts`

**目的**：让生产镜像内可以运行 TypeORM 迁移。

```ts
// server/src/migrate.ts
import 'dotenv/config';
import dataSource from './config/typeorm.config';

async function main() {
  await dataSource.initialize();
  const ran = await dataSource.runMigrations({ transaction: 'each' });
  if (ran.length === 0) {
    console.log('No pending migrations.');
  } else {
    console.log(`Applied ${ran.length} migration(s):`);
    for (const m of ran) console.log(`  - ${m.name}`);
  }
  await dataSource.destroy();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

`nest build` 会自动把它编到 `dist/migrate.js`，无需额外配置。

#### 4.2 修改 `docker-compose.prod.yml`

把 3 个服务的 `build:` 改成 `image:`，新增 `migrate` 服务。`postgres` / `redis` / `nginx` 不变。

```yaml
services:
  # ── Reverse proxy ─────────────────────────────────────────────
  nginx:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      server:
        condition: service_started
      web:
        condition: service_started
      admin:
        condition: service_started
    restart: unless-stopped

  # ── User-facing H5 ────────────────────────────────────────────
  web:
    image: registry.${ACR_REGION:-cn-hangzhou}.aliyuncs.com/${ACR_NAMESPACE:-beautify-work}/web:${TAG:-latest}
    restart: unless-stopped

  # ── Admin console ─────────────────────────────────────────────
  admin:
    image: registry.${ACR_REGION:-cn-hangzhou}.aliyuncs.com/${ACR_NAMESPACE:-beautify-work}/admin:${TAG:-latest}
    restart: unless-stopped

  # ── NestJS API server ─────────────────────────────────────────
  server:
    image: registry.${ACR_REGION:-cn-hangzhou}.aliyuncs.com/${ACR_NAMESPACE:-beautify-work}/server:${TAG:-latest}
    env_file: .env
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_URL=postgresql://app:app@postgres:5432/medical_aesthetics
      - REDIS_URL=redis://redis:6379
      - FRONTEND_URL=http://${HOST_IP:-localhost}
      - ADMIN_URL=http://${HOST_IP:-localhost}/admin
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  # ── Bull Worker (reuses server image) ─────────────────────────
  worker:
    image: registry.${ACR_REGION:-cn-hangzhou}.aliyuncs.com/${ACR_NAMESPACE:-beautify-work}/server:${TAG:-latest}
    command: ["node", "dist/workers/generate.worker.js"]
    env_file: .env
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://app:app@postgres:5432/medical_aesthetics
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  # ── Database migrations (one-shot, profile=migrate) ──────────
  migrate:
    image: registry.${ACR_REGION:-cn-hangzhou}.aliyuncs.com/${ACR_NAMESPACE:-beautify-work}/server:${TAG:-latest}
    command: ["node", "dist/migrate.js"]
    env_file: .env
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://app:app@postgres:5432/medical_aesthetics
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: "no"
    profiles: ["migrate"]

  # ── PostgreSQL ────────────────────────────────────────────────
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: medical_aesthetics
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d medical_aesthetics"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  # ── Redis ─────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

**关键点**：

- `migrate` 服务用 `server` 镜像 + 覆盖 command，`profiles: ["migrate"]` 不会随 `up -d` 起来，必须显式 `run` 才执行
- 镜像 tag 用 `${TAG:-latest}`，默认 latest 便于手动操作，CI 部署时覆盖成 sha

#### 4.3 重写 `.github/workflows/deploy.yml`

```yaml
name: Deploy to Production

on:
  push:
    branches:
      - feature/h5-redesign
  workflow_dispatch:

env:
  ACR_REGISTRY: registry.${{ secrets.ACR_REGION }}.aliyuncs.com
  ACR_NAMESPACE: ${{ secrets.ACR_NAMESPACE }}
  IMAGE_TAG: ${{ github.sha }}

jobs:
  # ── 1. CI ────────────────────────────────────────────────
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

  # ── 2. 构建并推送 3 个镜像到 ACR ───────────────────────
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to ACR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.ACR_REGISTRY }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build & push web
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./web/Dockerfile
          push: true
          tags: |
            ${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/web:${{ env.IMAGE_TAG }}
            ${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/web:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push admin
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./admin/Dockerfile
          push: true
          tags: |
            ${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/admin:${{ env.IMAGE_TAG }}
            ${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/admin:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push server
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./server/Dockerfile
          push: true
          tags: |
            ${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/server:${{ env.IMAGE_TAG }}
            ${{ env.ACR_REGISTRY }}/${{ env.ACR_NAMESPACE }}/server:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── 3. ECS 拉镜像、迁移、起服务、健康检查 ─────────────
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.ECS_HOST }}
          username: ${{ secrets.ECS_USER }}
          key: ${{ secrets.ECS_SSH_KEY }}
          script: |
            set -e
            cd /opt/medical-aesthetics

            echo "==> 同步代码（仅 docker-compose 配置和 nginx.conf）"
            git pull origin feature/h5-redesign

            echo "==> 登录 ACR"
            echo "${{ secrets.ACR_PASSWORD }}" | docker login \
              --username "${{ secrets.ACR_USERNAME }}" \
              --password-stdin \
              registry.${{ secrets.ACR_REGION }}.aliyuncs.com

            echo "==> 导出镜像 tag 环境变量"
            export TAG=${{ github.sha }}
            export ACR_REGION=${{ secrets.ACR_REGION }}
            export ACR_NAMESPACE=${{ secrets.ACR_NAMESPACE }}

            echo "==> 拉新镜像"
            docker compose -f docker-compose.prod.yml pull

            echo "==> 跑数据库迁移（profile=migrate，结束后自动 rm 容器）"
            docker compose -f docker-compose.prod.yml --profile migrate run --rm migrate

            echo "==> 起服务"
            docker compose -f docker-compose.prod.yml up -d --remove-orphans

            echo "==> 等待 10s 让 server 自检完成"
            sleep 10

            echo "==> 健康检查"
            for i in 1 2 3 4 5; do
              if curl -fsS http://localhost:8080/api/health; then
                echo "OK"; break
              fi
              echo "retry $i/5..."
              sleep 5
            done

            echo "==> 清理悬空镜像"
            docker image prune -f

            echo "==> Deploy completed at $(date)"
```

### 5. （可选）历史 workflow 清理

- `ci.yml`：保留不变（仍跑测试）
- `deploy-staging.yml`：是历史遗留的微信小程序上传，跟 ECS 无关，可删可留

---

## 关键文件清单

| 文件 | 改动 |
|---|---|
| `server/src/migrate.ts` | 新增（迁移 runner） |
| `docker-compose.prod.yml` | `build:` → `image:`；新增 `migrate` 服务 |
| `.github/workflows/deploy.yml` | 重写为「构建推送 + 拉取 + 迁移 + 启动 + 健康检查」 |
| `.env.example` | 不变 |
| `server/Dockerfile` / `web/Dockerfile` / `admin/Dockerfile` | **不变**（镜像内容不变） |
| `nginx.conf` | 不变 |

---

## 验证 / 上线步骤

1. **本地构建测试**：`npm run build` 在每个 workspace 跑通
2. **本地跑迁移**：`cd server && DATABASE_URL=... npx ts-node src/migrate.ts` 验证迁移逻辑（可选）
3. **首次推送到 `feature/h5-redesign`**：
   - 看 GitHub Actions 是否通过
   - 登录阿里云 ACR 控制台，确认 3 个仓库出现了新镜像
4. **ECS 验证**：

   ```bash
   docker compose -f docker-compose.prod.yml ps   # 6 个服务 running
   curl -fsS http://<ECS_IP>:8080/api/health      # 应返回 {status: ok}
   curl -fsS http://<ECS_IP>:8080/                 # 应返回 web H5
   curl -fsS http://<ECS_IP>:8080/admin/           # 应返回 admin
   ```

5. **第二次推送验证**：
   - 提交一个无关紧要的改动
   - 观察 Actions：构建缓存命中（10-30s）→ 推送 → ECS 拉镜像 → 跑迁移 → 起服务 → 健康检查
   - 总耗时对比：首次 ~10min（含首次构建），后续 ~1-2min

---

## 回滚策略

1. **代码回滚**：本地 `git revert` 后推送，自动走完整 deploy 流，ECS 用旧 commit sha 的镜像
2. **镜像回滚**（不重新构建）：SSH ECS 手动：

   ```bash
   cd /opt/medical-aesthetics
   export TAG=<上一个正常的 sha>
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d
   ```

3. **数据库迁移回滚**：TypeORM 支持 `migration:revert`，需新增 `server/dist/migrate-revert.js`，调用方式：

   ```bash
   docker compose -f docker-compose.prod.yml run --rm server node dist/migrate-revert.js
   ```

   （当前方案只正向迁移，如需自动 revert 需要再加 `migrate-revert.ts`）

---

## 风险与注意

1. **ACR 个人版的网络可达性**：必须选与 ECS 同一地域，否则跨地域拉镜像会扣流量且慢
2. **ACR 密码泄漏**：写在 GitHub Secrets，泄漏后立刻到阿里云控制台重置
3. **首次冷启动**：ACR 没缓存层镜像，第一次构建会比较慢（5-10min）；后续用 GHA cache 加速
4. **`worker` 与 `server` 共享镜像**：两边都用 `${TAG}` 拉同一镜像，部署命令里 worker 的 command 覆盖生效
5. **HOST_IP 环境变量**：ECS 上 compose 引用 `${HOST_IP:-localhost}`，需要在 `.env` 里设 `HOST_IP=<ECS 公网 IP>`，否则 FRONTEND_URL/ADMIN_URL 会错
6. **migrate 服务的 env**：必须能看到 postgres 容器，所以加了 `depends_on postgres/redis healthy`
7. **`docker image prune -f` 只清理 dangling 镜像**，不会删带 tag 的旧镜像，磁盘安全；如果想自动清理 ACR 旧 tag，去阿里云控制台配置保留策略
8. **registry endpoint 域名格式**：必须严格按 `registry.<region-id>.aliyuncs.com`（不带 https://），docker login 会自动加 https
9. **数据库迁移只前向**：revert 需要新增脚本，未包含在本方案默认范围

---

## 与现状对比的差异化要点

- 现有 `deploy.yml`：`git pull` + `up --build`（ECS 上重新 npm ci + nest/vite build，~10min）
- 新版：GHA 构建（缓存 + 并行）→ ACR 推送 → ECS `pull`（~10s）+ 迁移 + up（~30s）
- 主要新增：**镜像仓库、迁移 runner、健康检查**