FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates poppler-utils \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN DATABASE_URL=\"postgresql://build:build@localhost:5432/build?schema=public\" \
    pnpm --dir packages/db exec prisma generate --schema=prisma/schema.prisma

FROM base AS api

ENV NODE_ENV=production
EXPOSE 4100

CMD ["sh", "-c", "pnpm --filter @substrata/api exec tsx src/server.ts"]

FROM base AS web-build

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN pnpm --filter @substrata/web build

FROM web-build AS web

ENV NODE_ENV=production
EXPOSE 3100

CMD ["pnpm", "--filter", "@substrata/web", "exec", "next", "start", "-p", "3100"]
