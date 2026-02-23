# syntax=docker/dockerfile:1.6

# ─── VentureOS Dashboard — Multi-stage Docker Build ──────────────────────────
# Issue #140: Hybrid deployment design
# Issue #191: Production cutover
#
# Build:   docker compose build dashboard
# Run:     docker compose up -d
# Health:  curl http://localhost:8001/api/health
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-bullseye AS builder
WORKDIR /opt/ventureos

# Install system dependencies for native modules (better-sqlite3)
RUN apt-get update -qq && apt-get install -y --no-install-recommends \
    python3 make g++ file \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifests + postinstall scripts first for better layer caching
COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/package.json
COPY scripts/ensure-native-modules.sh scripts/ensure-native-modules.sh

RUN npm ci

# Copy full source
COPY . .

# Compile TypeScript
RUN npm run compile --workspace=dashboard

# Ensure ESM module resolution for compiled dashboard output.
# The root package.json is "type": "commonjs" but dashboard compiles to ESM.
# dist/lib/ is CJS (see compile script), dist/dashboard/ is ESM.
RUN echo '{"type":"module"}' > dashboard/dist/dashboard/package.json

# Prune dev dependencies for smaller runtime image
RUN npm prune --omit=dev

# Ensure client assets are available alongside compiled server output.
# TypeScript outputs to dashboard/dist/ (outDir=./dist, rootDir=..).
RUN mkdir -p /opt/ventureos/dashboard/dist/dashboard/client \
  && cp -R dashboard/client/* /opt/ventureos/dashboard/dist/dashboard/client/

# Tactical-map dist is already in place from COPY . . (serves /map/ route)

# ─── Runtime Stage ───────────────────────────────────────────────────────────
FROM node:20-bullseye-slim AS runtime
WORKDIR /opt/ventureos

ENV NODE_ENV=production \
    VENTUREOS_ROOT=/opt/ventureos

COPY --from=builder /opt/ventureos/node_modules ./node_modules
COPY --from=builder /opt/ventureos/dashboard/dist ./dist
COPY --from=builder /opt/ventureos/dashboard/package.json ./dashboard/package.json
COPY --from=builder /opt/ventureos/package.json ./package.json

# Copy tactical-map dist (serves /map/ route in dashboard server)
# Uses a wildcard so it doesn't fail if dist doesn't exist
COPY --from=builder /opt/ventureos/tactical-map/dis[t] ./tactical-map/dist

# Create data directories and set ownership
RUN mkdir -p /opt/ventureos/data /opt/ventureos/dashboard/data \
  && chown -R node:node /opt/ventureos

USER node
EXPOSE 8001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://localhost:8001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/dashboard/server/server.js"]
