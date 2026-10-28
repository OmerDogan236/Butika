# Multi-stage Next.js standalone:
# 1) deps  — pnpm install
# 2) build — `next build` (standalone output)
# 3) runner — minimal Node 22 + standalone server

FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && npm i -g pnpm@10

COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/admin/package.json apps/admin/
COPY apps/mobile/package.json apps/mobile/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/design-tokens/package.json packages/design-tokens/

RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @butika/admin build

# Standalone runner — sadece .next/standalone + static + public lazım.
# Workspace packages (types, design-tokens) zaten standalone içine bundle olur.
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/apps/admin/.next/standalone ./
COPY --from=build /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=build /app/apps/admin/public ./apps/admin/public

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/login').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"
CMD ["node", "apps/admin/server.js"]
