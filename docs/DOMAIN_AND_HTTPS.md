# Domain and HTTPS

TraceMe 推荐通过 HTTPS 域名访问，并由反向代理转发到本机应用端口。

访问链路：

```text
浏览器 -> HTTPS 域名 -> 反向代理 -> 127.0.0.1:3000 -> Next.js 应用
```

## DNS

在域名服务商处添加记录：

- `A` 记录：指向服务器 IPv4。
- `AAAA` 记录：指向服务器 IPv6，可选。
- 子域名示例：`travel.example.com`。

示例：

```text
travel.example.com  A     203.0.113.10
travel.example.com  AAAA  2001:db8::10
```

DNS 生效后，可在服务器上确认：

```bash
dig travel.example.com A
dig travel.example.com AAAA
```

## 推荐方案：Caddy

Caddy 会自动申请和续期 Let's Encrypt 证书，并默认将 HTTP 跳转到 HTTPS。

安装 Caddy 后，创建 `/etc/caddy/Caddyfile`：

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
```

确认：

```bash
curl -I https://travel.example.com
```

HSTS 可选。建议确认域名、证书、反向代理和回滚方案都稳定后再开启：

```caddyfile
header Strict-Transport-Security "max-age=31536000; includeSubDomains"
```

## 可选方案：Nginx

可以使用 Certbot 申请 Let's Encrypt 证书：

```bash
sudo certbot --nginx -d travel.example.com
```

示例 Nginx server：

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

Certbot 通常会安装自动续期 timer：

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

## 不要暴露私有目录

不要在 Caddy/Nginx 中把以下路径配置为静态目录：

- `.env`
- SQLite 数据库文件
- `storage/uploads`
- `storage/backups`
- 备份 zip

这些文件只能由应用在登录鉴权后按需读取。反向代理只转发到 `127.0.0.1:3000`。

## 应用配置

生产 `.env` 中设置：

```env
APP_BASE_URL="https://travel.example.com"
TRACEME_BIND="127.0.0.1"
TRACEME_PORT="3000"
```

域名访问时，`APP_BASE_URL` 必须是 HTTPS URL，否则启动校验会失败。域名尚未配置完成时，可以临时使用 `http://服务器IP:3000` 测试；本地 Docker 冒烟测试也可以使用 `http://localhost:3000` 或 `http://127.0.0.1:3000`。切换到域名后，请改回 `https://travel.example.com`。
