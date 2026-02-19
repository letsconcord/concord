# ── Stage 1: Build ──
# Build context: Client/ (workspace root)
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 pip make g++ && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy package manifests for dependency resolution
COPY packages/protocol/package.json packages/protocol/
COPY packages/crypto/package.json packages/crypto/
COPY apps/concord-server/package.json apps/concord-server/

# Install all dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY packages/protocol/ packages/protocol/
COPY packages/crypto/ packages/crypto/
COPY apps/concord-server/ apps/concord-server/

# Build packages in dependency order
RUN pnpm --filter @concord/protocol build && \
    pnpm --filter @concord/crypto build && \
    pnpm --filter @concord/concord-server build

# Prune devDependencies
RUN pnpm --filter @concord/concord-server --prod deploy /app/pruned

# ── Stage 2: Runtime ──
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/pruned/node_modules ./node_modules
COPY --from=builder /app/apps/concord-server/dist ./dist
COPY --from=builder /app/apps/concord-server/package.json ./

# Copy built workspace packages into node_modules
COPY --from=builder /app/packages/protocol/dist ./node_modules/@concord/protocol/dist
COPY --from=builder /app/packages/protocol/package.json ./node_modules/@concord/protocol/
COPY --from=builder /app/packages/crypto/dist ./node_modules/@concord/crypto/dist
COPY --from=builder /app/packages/crypto/package.json ./node_modules/@concord/crypto/

ENV NODE_ENV=production
ENV PORT=9000
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

VOLUME /data
EXPOSE 9000
EXPOSE 10000-10100/udp

CMD ["node", "dist/index.js"]
