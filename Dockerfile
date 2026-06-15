# Multi-stage build: deps -> build -> prod-deps -> runtime.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# --- deps: full install (dev deps included) for building -------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- build: compile SvelteKit (adapter-node -> build/) ---------------------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- prod-deps: production-only node_modules (incl. native @node-rs/argon2)
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# --- runtime: slim non-root image ------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# tini becomes PID 1 (see ENTRYPOINT) to reap zombies and forward signals -
# start.mjs spawns child processes (migrate, then the server) and can't do that.
RUN apk add --no-cache tini

COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/build ./build
COPY --chown=node:node package.json ./
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts

USER node
EXPOSE 3000

# Healthcheck lives in the image so plain `docker run` / k8s get it too (not just compose).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini -> start.mjs: applies drizzle migrations, then starts the SvelteKit server.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "scripts/start.mjs"]
