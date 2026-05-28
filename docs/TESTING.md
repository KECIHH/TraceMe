# Testing

本项目当前包含单元 smoke test 和首页 e2e smoke test。后续功能扩展时，应继续补充领域逻辑、API、数据库和关键页面流程测试。

## 命令

运行 ESLint：

```bash
npm run lint
```

运行 TypeScript 类型检查：

```bash
npm run typecheck
```

运行 Vitest：

```bash
npm run test
```

监听模式运行 Vitest：

```bash
npm run test:watch
```

运行 Playwright：

```bash
npm run test:e2e
```

如果 Playwright 缺少浏览器，请执行：

```bash
npx playwright install chromium
```

完整本地验收建议顺序：

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```
