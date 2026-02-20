# ── Stage 1: Build ──
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 pip make g++ && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

WORKDIR /app

# Copy workspace config (lockfile deliberately excluded — it was generated
# with apps/client present and causes broken dep resolution without it)
COPY package.json tsconfig.base.json ./

# Workspace with only the packages present in this build
RUN printf 'packages:\n  - "packages/*"\n  - "apps/concord-server"\n\nonlyBuiltDependencies:\n  - better-sqlite3\n  - esbuild\n  - mediasoup\n' > pnpm-workspace.yaml

# Hoisted node_modules — pnpm's default symlinked layout breaks in Docker
# subset builds (per-package .bin shims and .pnpm store links are invalid)
RUN printf 'node-linker=hoisted\nshamefully-hoist=true\n' > .npmrc

# Copy package manifests
COPY packages/protocol/package.json packages/protocol/
COPY packages/crypto/package.json packages/crypto/
COPY apps/concord-server/package.json apps/concord-server/

RUN pnpm install

# Hoisted mode doesn't reliably link workspace packages — create them manually
RUN mkdir -p node_modules/@concord && \
    ln -sf /app/packages/protocol node_modules/@concord/protocol && \
    ln -sf /app/packages/crypto node_modules/@concord/crypto

# Copy source code
COPY packages/protocol/ packages/protocol/
COPY packages/crypto/ packages/crypto/
COPY apps/concord-server/ apps/concord-server/

# Build in dependency order (root-level tsc works with hoisted layout;
# third-party deps resolve from /app/node_modules, workspace packages
# resolve via the manual symlinks above)
RUN /app/node_modules/.bin/tsc -p packages/protocol && \
    /app/node_modules/.bin/tsc -p packages/crypto && \
    /app/node_modules/.bin/tsc -p apps/concord-server

# Prune for production
RUN pnpm --filter @concord/concord-server --prod deploy --legacy /app/pruned

# ── Stage 2: Runtime ──
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/pruned/node_modules ./node_modules
COPY --from=builder /app/apps/concord-server/dist ./dist
COPY --from=builder /app/apps/concord-server/package.json ./

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
