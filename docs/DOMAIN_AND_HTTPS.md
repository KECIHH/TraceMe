# 域名与 HTTPS

TraceMe 推荐通过 HTTPS 域名访问，并由反向代理转发到本机应用端口。正式域名访问不能使用 HTTP。

推荐链路：

```text
浏览器 -> HTTPS 域名 -> Caddy/Nginx -> 127.0.0.1:3000 -> TraceMe
```

## DNS

在域名服务商处添加记录：

- `A`: 指向服务器 IPv4。
- `AAAA`: 指向服务器 IPv6，可选。

示例：

```text
travel.example.com  A     203.0.113.10
travel.example.com  AAAA  2001:db8::10
```

确认：

```bash
dig travel.example.com A
dig travel.example.com AAAA
```

## Caddy 推荐配置

Caddy 会自动申请和续期 Let's Encrypt 证书，并默认把 HTTP 跳转到 HTTPS。

`/etc/caddy/Caddyfile`：

```caddyfile
travel.example.com {
  reverse_proxy 127.0.0.1:3000

  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

重载：

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -I https://travel.example.com
```

HSTS 可选。确认域名、证书、反向代理和回滚方案稳定后再开启：

```caddyfile
header Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

## Nginx 可选配置

申请证书：

```bash
sudo certbot --nginx -d travel.example.com
```

示例：

```nginx
server {
  listen 80;
  server_name travel.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name travel.example.com;

  ssl_certificate /etc/letsencrypt/live/travel.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/travel.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

续期检查：

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

## 应用配置

生产 `.env`：

```env
APP_BASE_URL="https://travel.example.com"
TRACEME_BIND="127.0.0.1"
TRACEME_PORT="3000"
```

规则：

- 正式域名必须使用 HTTPS。
- `http://服务器IP:3000` 只用于域名未准备好时的临时测试。
- `http://localhost:3000` 或 `http://127.0.0.1:3000` 只用于本地冒烟测试。
- 切换到正式域名后，必须把 `APP_BASE_URL` 改回 HTTPS 域名并重启应用。

## 私有目录边界

反向代理只应转发到 `127.0.0.1:3000`。不要把以下目录配置为静态目录：

- `.env`
- SQLite 数据库文件
- `storage/uploads`
- `storage/backups`
- `storage/secrets`
- 任何备份 zip

上传文件和备份文件只能由应用在鉴权后读取。

## 502 排查

如果浏览器显示 502：

```bash
docker compose ps
docker compose logs --tail=120 travel-planner
curl http://127.0.0.1:3000/api/health
```

常见原因：

- 应用容器未启动。
- `APP_BASE_URL`、`SESSION_SECRET` 或其他生产环境变量校验失败。
- Prisma migration 失败。
- 服务器仍运行旧镜像。
- 反向代理 upstream 不是 `127.0.0.1:3000`。
