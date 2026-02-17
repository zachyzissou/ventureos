# syntax=docker/dockerfile:1.6

FROM node:20-bullseye AS builder
WORKDIR /opt/ventureos

COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/package.json

RUN npm ci

COPY . .
RUN npm run compile --workspace=dashboard
RUN npm prune --omit=dev

# Ensure client assets are available alongside compiled server output.
RUN mkdir -p /opt/ventureos/dist/dashboard/client \
  && cp -R dashboard/client/* /opt/ventureos/dist/dashboard/client/

FROM node:20-bullseye-slim AS runtime
WORKDIR /opt/ventureos

ENV NODE_ENV=production \
  VENTUREOS_ROOT=/opt/ventureos

COPY --from=builder /opt/ventureos/node_modules ./node_modules
COPY --from=builder /opt/ventureos/dist ./dist
COPY --from=builder /opt/ventureos/dashboard/package.json ./dashboard/package.json
COPY --from=builder /opt/ventureos/package.json ./package.json

RUN mkdir -p /opt/ventureos/data /opt/ventureos/dashboard/data \
  && chown -R node:node /opt/ventureos

USER node
EXPOSE 8001

CMD ["node", "dist/dashboard/server/server.js"]
