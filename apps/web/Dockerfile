FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_API_BASE_URL=
ARG VITE_PUBLIC_APP_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/shared/src packages/shared/src
RUN npm ci
COPY . .
RUN npm run build --workspace @game-is-up/shared && npm run build --workspace @game-is-up/web

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
