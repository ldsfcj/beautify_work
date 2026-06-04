# 医美咨询 AI 预览小程序

微信小程序，给医美咨询师上传客户照片 + 选预设项目 + AI 生成整形预览。

## 当前状态

✅ **项目框架已搭好**（2026-06-04）

- 根目录配置（package.json / .gitignore / app.json / project.config.json）：真实
- 80+ 个目录、~200 个文件：占位符版本
- 占位符都标了 `// Placeholder for Runbook Task N`

> 详见 [`FRAMEWORK_STATUS.md`](./FRAMEWORK_STATUS.md) 了解完整目录映射。

## 文档

| 文档 | 内容 |
|---|---|
| [`FRAMEWORK_STATUS.md`](./FRAMEWORK_STATUS.md) | 当前框架结构状态 |
| [`docs/superpowers/specs/2026-06-04-医美咨询小程序-design.md`](./docs/superpowers/specs/2026-06-04-医美咨询小程序-design.md) | 设计终稿（15 节） |
| [`docs/superpowers/plans/2026-06-04-医美咨询小程序-implementation.md`](./docs/superpowers/plans/2026-06-04-医美咨询小程序-implementation.md) | 实施计划（38 任务） |
| [`docs/superpowers/execution/2026-06-04-医美咨询小程序-runbook.md`](./docs/superpowers/execution/2026-06-04-医美咨询小程序-runbook.md) | **执行 Runbook（从这里开始）** |

## 开发

```bash
# 安装依赖（云开发 SDK、Jest、Vue 等）
npm install
cd cloudfunctions/_shared && npm install
cd admin && npm install
cd ../..

# 单元测试
npm run test:unit

# 部署到云开发（需要真实账号 + 私钥）
npx miniprogram-ci upload --pp ./miniprogram/project.config.json --pkp ./private.key
```

## 任务执行

```bash
# 查看所有占位符
grep -r "Placeholder for Runbook" . -l | head

# 找到 Runbook 中对应的 Task
# 例如 Task 9 = user.login 云函数
open docs/superpowers/execution/2026-06-04-医美咨询小程序-runbook.md
```

详见 [执行 Runbook](./docs/superpowers/execution/2026-06-04-医美咨询小程序-runbook.md)。
