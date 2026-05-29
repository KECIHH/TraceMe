# Testing

TraceMe 使用 ESLint、TypeScript、Vitest、Next build 和 Playwright 做交付前验证。E2E 测试会启动生产构建后的 standalone 服务，并使用 SQLite 测试数据库。

## 单元测试

运行：

```bash
npm run test
```

覆盖重点：

- 登录、密码 hash、session cookie 选项。
- 环境变量和生产配置校验。
- 旅行表单、行程日期、地点和清单辅助逻辑。
- 路线评分稳定性。
- 预算统计与汇率换算。
- 文件扩展名、MIME、内容签名、路径穿越防护。
- 文件下载限流。
- AI provider、敏感信息拦截、提示摘要。
- 导出和备份 manifest。
- 设置中心系统信息脱敏。

监听模式：

```bash
npm run test:watch
```

## E2E 测试

运行：

```bash
npm run test:e2e
```

E2E 覆盖重点：

- 未登录访问受保护页面会跳转登录。
- 登录、Dashboard、退出登录。
- 旅行创建、编辑、归档、删除。
- 目的地、地点、笔记、准备清单和模板清单。
- 行程日期生成、行程项校验、排序、状态更新、今日模式。
- 路线规划、交通方案评分、权重切换、选择和删除。
- 美食、住宿、预算支出和统计。
- 文件上传、下载、删除、危险文件阻止和非 public 访问。
- AI mock 草稿、敏感信息阻止、保存为笔记。
- 单旅行导出、系统备份创建、下载和删除。
- 设置中心、改密码、AI 状态、系统信息脱敏。
- 移动端导航、移动端创建页、今日模式和表单错误。

Playwright 配置使用 `workers: 1`。原因是这些测试共享一个 SQLite 测试库，并会进行创建、删除、改密码和备份等写入流程；串行执行可以避免测试之间的数据竞争。

## 安装 Playwright 浏览器

如果本机没有 Chromium：

```bash
npx playwright install chromium
```

如果 CI 或 Docker 环境缺少系统依赖，请按 Playwright 提示安装对应依赖。

## 完整验收顺序

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

如果支持 Docker：

```bash
docker compose build
docker compose up -d
```

然后访问：

```text
http://127.0.0.1:3000/api/health
```

## 如何写新测试

- 领域逻辑优先写 Vitest，避免只靠浏览器路径发现问题。
- 涉及登录、页面跳转、文件下载、备份、移动端布局时写 Playwright。
- 新 E2E 数据应使用明显虚构的名称和时间戳后缀。
- 不要依赖测试执行顺序以外的隐式状态。
- 不要删除测试来规避失败；如果测试不合理，应重写断言并说明原因。
- 不要关闭 strict typecheck 或降低安全校验。

## 常见失败原因

- `npm` 在 PowerShell 中被执行策略拦截：改用 `npm.cmd`。
- 缺少 Playwright 浏览器：运行 `npx playwright install chromium`。
- E2E 提示 standalone build 缺失：先运行 `npm run build`。
- 登录失败：检查 `.env.test` 和 seed 用户密码。
- 数据库锁或串扰：确认 Playwright `workers` 为 1。
- 上传测试失败：检查文件类型、MIME、内容签名和 `storage/uploads` 权限。
- Docker build 失败：检查网络、镜像拉取、默认密钥和生产环境变量。
