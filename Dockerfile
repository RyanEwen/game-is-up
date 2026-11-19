# The production image (DIST-12): one image that runs the API, which also serves the built web
# app. compose.server.yml builds it; `npm run deploy:prod` deploys it.
# Keep this Node version equal to .nvmrc (PLAT-1).
FROM node:24.22.3-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Dependencies first, so a source-only change reuses this layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Install scripts stay on: Prisma's postinstall fetches the engines that migrations use at start.
RUN npm ci --no-audit --no-fund

# The web app reads these at build time; empty VITE_API_BASE_URL means the same origin.
ARG VITE_API_BASE_URL=
ARG VITE_PUBLIC_APP_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY apps/web apps/web
# The web build generates its third-party notices with this script.
COPY scripts/dev/generate-third-party-notices.mjs scripts/dev/
RUN npm run db:generate && npm run build
# Migrations run at start, so the Prisma CLI is a production dependency and survives the prune.
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
	&& mkdir -p packages/shared/node_modules apps/api/node_modules

# Same pin as the build stage above (.nvmrc).
FROM node:24.22.3-bookworm-slim AS runtime
WORKDIR /app
# The commit and version the deploy validated (CTR-1); compose.server.yml passes them.
ARG REVISION=unknown
ARG VERSION=unknown
LABEL org.opencontainers.image.revision=$REVISION org.opencontainers.image.version=$VERSION
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production API_PORT=4000 WEB_DIST_DIR=/app/apps/web/dist

# Built output and production dependencies only, never sources or tests.
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
# A workspace keeps its own copy of a dependency when the root holds another major of it for a
# third-party package; the image would then silently run the root's major. Ship these too.
COPY --from=build --chown=node:node /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 4000
# Applies pending migrations, then execs the API so it is the process that receives stop signals.
CMD ["npm", "run", "start:prod"]
