# Multi-stage build; the runtime stage runs as a non-root user.
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
# Postgres URL at install time so `postinstall` generates the Postgres Prisma client (see scripts/prisma.mjs).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
COPY package.json package-lock.json ./
COPY scripts ./scripts
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# Includes dev dependencies on purpose: the container also runs migrations and the seed (prisma CLI, tsx).
COPY --from=build --chown=app:app /app ./
RUN mkdir -p /app/data && chown app:app /app/data
USER app
EXPOSE 3000
CMD ["sh", "docker/entrypoint.sh"]
