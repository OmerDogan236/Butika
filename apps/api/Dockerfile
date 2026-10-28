# Multi-stage:
# 1) deps   — Node 22 + pnpm; full source ile install (workspace symlinks runtime'da kalsın)
# 2) runner — Bun 1.2 runtime, deps stage'den tüm /app tree'yi kopyala
#
# Workspace symlinks (@butika/db, @butika/types) aynı tree içinde olunca
# Bun symlink'leri normal resolve eder. Multi-stage'de "node_modules + selective
# packages copy" yaklaşımı symlinks'i kırıyor; tam tree kopyalama daha sağlam.

FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm i -g pnpm@10

COPY . .
RUN pnpm install --frozen-lockfile

FROM oven/bun:1.2-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app ./

EXPOSE 3000
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1
CMD ["bun", "run", "apps/api/src/index.ts"]
