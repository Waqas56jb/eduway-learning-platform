# syntax=docker/dockerfile:1.7
# EDUWAY API — production image. Build context: server/
#   docker build -t eduway-api ./server
#   docker run --env-file server/.env.production -p 4100:4100 eduway-api
# Secrets are NEVER baked into the image: every variable comes from the platform's env settings at runtime.

ARG NODE_VERSION=22
# Node 22 LTS: @supabase/supabase-js 2.118+ requires node >= 22.

# ── 1. all dependencies (dev included) for the TypeScript build ──
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── 2. compile src/ + scripts/ to dist/ and copy migrations + seed data ──
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
COPY tools ./tools
RUN npm run build

# ── 3. production-only node_modules ──
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ── 4. runtime ──
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=4100 \
    API_PREFIX=/api/v1
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Receipt PDF fonts (resolved by walking up from dist/src/modules/payments to assets/fonts)
COPY --chown=node:node assets ./assets
COPY --chown=node:node package.json ./
USER node
EXPOSE 4100
# Liveness: GET /api/v1/health (no DB call). Readiness with DB/storage checks is /api/v1/health/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4100)+(process.env.API_PREFIX||'/api/v1')+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Run node directly (PID 1) so SIGTERM reaches server.ts, which closes HTTP, pg-boss and the pg pool.
CMD ["node", "dist/src/server.js"]
