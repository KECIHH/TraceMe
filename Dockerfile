FROM node:lts-alpine AS deps
WORKDIR /app
ARG ALPINE_REPOSITORY_MIRROR=""
ARG NPM_CONFIG_REGISTRY="https://registry.npmjs.org/"
ENV npm_config_registry=${NPM_CONFIG_REGISTRY}
RUN if [ -n "$ALPINE_REPOSITORY_MIRROR" ]; then sed -i "s|https://dl-cdn.alpinelinux.org/alpine|$ALPINE_REPOSITORY_MIRROR|g" /etc/apk/repositories; fi \
  && apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --fund=false

FROM node:lts-alpine AS builder
WORKDIR /app
ARG ALPINE_REPOSITORY_MIRROR=""
ARG BUILD_NODE_OPTIONS="--max-old-space-size=1024"
ENV NODE_OPTIONS=${BUILD_NODE_OPTIONS}
RUN if [ -n "$ALPINE_REPOSITORY_MIRROR" ]; then sed -i "s|https://dl-cdn.alpinelinux.org/alpine|$ALPINE_REPOSITORY_MIRROR|g" /etc/apk/repositories; fi \
  && apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

FROM node:lts-alpine AS prod-deps
WORKDIR /app
ARG ALPINE_REPOSITORY_MIRROR=""
RUN if [ -n "$ALPINE_REPOSITORY_MIRROR" ]; then sed -i "s|https://dl-cdn.alpinelinux.org/alpine|$ALPINE_REPOSITORY_MIRROR|g" /etc/apk/repositories; fi \
  && apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm prune --omit=dev --ignore-scripts --no-audit --fund=false
RUN npx prisma generate

FROM node:lts-alpine AS runner
WORKDIR /app
ARG ALPINE_REPOSITORY_MIRROR=""
RUN if [ -n "$ALPINE_REPOSITORY_MIRROR" ]; then sed -i "s|https://dl-cdn.alpinelinux.org/alpine|$ALPINE_REPOSITORY_MIRROR|g" /etc/apk/repositories; fi \
  && apk add --no-cache openssl \
  && addgroup -S nodejs \
  && adduser -S nextjs -G nodejs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/ensure-sqlite-db.mjs ./scripts/ensure-sqlite-db.mjs
COPY --from=builder /app/scripts/seed-admin.mjs ./scripts/seed-admin.mjs
COPY --from=builder /app/scripts/validate-production-env.mjs ./scripts/validate-production-env.mjs
COPY package.json package-lock.json ./

RUN mkdir -p /app/prisma/data /app/storage/uploads /app/storage/backups \
  && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node scripts/validate-production-env.mjs && node scripts/ensure-sqlite-db.mjs && npx prisma migrate deploy && node server.js"]
