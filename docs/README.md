# TraceMe 文档索引

这组文档按成熟项目的维护方式组织：README 负责快速理解和启动，`docs/` 负责可执行的设计、部署、运维、安全和测试说明。修改功能、部署脚本、环境变量、权限模型或数据边界时，请同步更新对应文档。

## 项目理解

- [项目规格](PROJECT_SPEC.md)：产品定位、核心能力、非目标和公开化前置条件。
- [架构说明](ARCHITECTURE.md)：技术架构、路由分层、权限矩阵、数据存储和启动流程。
- [AI 功能](AI.md)：AI-first 旅行生成、Provider 配置、草稿落库和安全边界。

## 部署与运维

- [部署指南](DEPLOYMENT.md)：一键部署、手动 Docker 部署、环境变量、生产启动流程和增量更新。
- [域名与 HTTPS](DOMAIN_AND_HTTPS.md)：DNS、Caddy、Nginx、HTTPS 和反向代理边界。
- [运维手册](OPERATIONS.md)：日常命令、备份、恢复、迁移、故障排查和换服务器。
- [发布检查清单](RELEASE_CHECKLIST.md)：发布前必须确认的自动化与人工检查。

## 安全、数据与外部依赖

- [安全模型](SECURITY.md)：认证、会话、权限、分享、文件、备份、日志和响应头。
- [备份与恢复](DATA_BACKUP_AND_RECOVERY.md)：文档加密、备份格式、校验、恢复和保留策略。
- [PWA 与离线](PWA_OFFLINE.md)：Service Worker、离线摘要、敏感数据边界和浏览器兼容性。
- [外部服务](EXTERNAL_PROVIDERS.md)：地图、天气、汇率 provider、环境变量、缓存和降级。

## 质量保障

- [测试指南](TESTING.md)：lint、typecheck、Vitest、Playwright、构建和常见失败原因。

## 文档维护原则

- 以实际代码、脚本和配置为准，不保留过期阶段报告作为正式文档。
- README 避免复制部署细节，只保留入口信息和最常用命令。
- 部署相关变更需要同时检查 `Dockerfile`、`docker-compose.yml`、`.env.example`、`scripts/start-production.mjs` 和启动/seed 脚本。
- 安全边界变更需要同步 `SECURITY.md`、`DATA_BACKUP_AND_RECOVERY.md` 和相关测试说明。
- 新增外部 provider 或 AI 配置项时，需要同步 `.env.example`、`AI.md`、`EXTERNAL_PROVIDERS.md` 和 `DEPLOYMENT.md`。
