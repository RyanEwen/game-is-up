FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/src packages/shared/src
RUN npm ci
COPY . .
RUN npm run db:generate
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node --from=build /app /app
USER node
EXPOSE 4000
CMD ["sh", "-c", "node scripts/dev/bootstrap-prisma-migrations.mjs && node apps/api/dist/index.js"]
