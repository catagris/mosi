# Contributing

Thanks for your interest in Mosi! This is a self-hostable SvelteKit +
PostgreSQL app. The notes below get you to a working local setup.

## Prerequisites

- Node 22+ and [pnpm](https://pnpm.io) 9+
- Docker (for PostgreSQL)

## Local setup

```bash
pnpm install
cp .env.example .env          # then fill in the required values
```

At minimum set `DATABASE_URL`, `SESSION_SECRET` (`openssl rand -hex 32`), and
`ORIGIN`. For convenient local work you can also set `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, and `REQUIRE_TOTP=false` to skip the setup wizard and 2FA, and
`ENCRYPTION_KEY` (`openssl rand -hex 32`) to exercise email encryption.

Start a database (the base compose file doesn't publish the DB port, so copy the
override first):

```bash
cp docker-compose.override.example.yml docker-compose.override.yml
docker compose up -d db
pnpm db:migrate
pnpm db:seed                  # optional demo event + sample RSVPs
pnpm dev
```

## Tests & checks

Everything below must pass before a change is merged:

```bash
pnpm check        # svelte-check / TypeScript - must be 0 errors
pnpm lint         # eslint --quiet
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright end-to-end (needs a reachable Postgres)
```

The E2E suite resets the test database on each run via its global setup, so
point it at a throwaway database, not one with data you care about.

## Conventions

- TypeScript strict mode; tabs; single quotes; `printWidth` 100 (`pnpm format`).
- Svelte 5 runes only (`$props`/`$state`/`$derived`, `onclick=`, `{@render}`).
- Server-only code lives under `src/lib/server/**`; never import it into
  `.svelte` components (type-only imports are fine).
- Routes/actions stay thin; business logic goes in `src/lib/server/services/**`.
- Schema changes: edit `src/lib/server/db/schema.ts`, then
  `pnpm db:generate` to produce a migration and commit it.

## Pull requests

Keep changes focused, include tests for new behavior, and make sure
`check` + `lint` + `test` are green. A short description of what changed and why
is plenty.
