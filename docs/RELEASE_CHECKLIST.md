# Release Checklist

发布前逐项确认：

- [ ] 代码已提交。
- [ ] `npm run lint` 通过。
- [ ] `npm run typecheck` 通过。
- [ ] `npm run test` 通过。
- [ ] `npm run test:e2e` 通过。
- [ ] `npm run build` 通过。
- [ ] `docker compose build` 通过。
- [ ] migration 已执行或已确认容器启动时执行成功。
- [ ] 管理员账号已设置强密码。
- [ ] `.env` 未提交。
- [ ] `APP_BASE_URL` 是生产 HTTPS 域名。
- [ ] HTTPS 正常，HTTP 自动跳转 HTTPS。
- [ ] secure cookie 正常。
- [ ] 上传文件不可直接通过 public URL 访问。
- [ ] 备份文件不可直接通过 public URL 访问。
- [ ] `/api/health` 不泄露敏感信息。
- [ ] `robots.txt` 和页面 noindex 符合当前不收录策略。
- [ ] 已创建首次备份。
- [ ] 已验证恢复流程文档。

## 手动测试

- [ ] `docker compose build`
- [ ] `docker compose up -d`
- [ ] 访问 `http://127.0.0.1:3000/api/health`
- [ ] 通过反向代理访问 HTTPS 域名
- [ ] 检查 HTTP 自动跳转 HTTPS
- [ ] 检查登录
- [ ] 创建旅行
- [ ] 上传文件后确认不能访问 `/storage/uploads/...`
- [ ] 创建备份后确认不能访问 `/storage/backups/...`
- [ ] 重启容器后确认数据仍存在
- [ ] 查看日志确认没有密码、session、API Key 或 secret 原文

## 公开化前禁止项

当前阶段不要开启：

- 公众注册
- 公开社区
- 公开分享
- 在线支付
- 搜索引擎收录

如果未来公开，需要先补齐隐私政策、用户协议、账号系统、权限系统、滥用防护和合规审查。
