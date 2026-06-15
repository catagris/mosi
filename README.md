# Mosi

[![CI](https://github.com/catagris/mosi/actions/workflows/ci.yml/badge.svg)](https://github.com/catagris/mosi/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL%20v3-blue.svg)](LICENSE)

Mosi (from 모시다, *mosida*: to host guests with care) is a self-hostable party and event RSVP system. Guests RSVP through a shareable link with no account or app. You run events from a password + TOTP-2FA admin panel that installs as a phone PWA and push-notifies you on every RSVP. One Docker Compose stack (app + PostgreSQL) runs unlimited events.

## Features

- Open guest RSVP links: share `/e/your-party`, guests just fill the form. No login.
- Multi-event from one deployment, with reusable templates to spin up new events in a click.
- Configurable sign-up list ("what to bring") with a custom noun (dishes, supplies, items), categories with target counts, a claimed-vs-needed board, and admin moderation.
- Built-in allergy and dietary tracking: guests pick allergens and severity; new sign-ups see an aggregated "what to avoid" notice.
- Custom field builder: required/optional fields per event (license plates, parking spots, anything).
- Plus-ones with optional adults/kids split. Capacity limits with an auto-promoting waitlist.
- Add to calendar: every confirmation offers an `.ics` and Google Calendar link with the guest's edit link embedded.
- Admin panel: password + TOTP 2FA, recovery codes, multiple admins. Installable PWA, light/dark theme.
- Notifications: in-app live alerts (SSE), Web Push to your phone, and webhooks (ntfy, Gotify, Telegram, JSON).
- Optional SMTP for guest magic edit links (off by default). Email encryption at rest (AES-256-GCM) when you set a key.
- CSV export of guest lists with custom-field answers. Per-event theming (colors, banner).

## Quick start

Prerequisites: [Docker](https://docs.docker.com/engine/install/) with the Compose plugin.

```bash
git clone https://github.com/catagris/mosi.git
cd mosi
cp .env.example .env
```

Set the required values in `.env`:

```bash
openssl rand -hex 16   # DB_PASSWORD
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY (recommended; encrypts emails at rest)
# ORIGIN=https://events.example.com   (your public URL)
```

Optional: `VAPID_*` for phone push (`npx web-push generate-vapid-keys`) and `SMTP_*` for guest emails. Leave them blank to disable.

```bash
docker compose up -d
```

Postgres starts, migrations apply automatically, and the app serves on `127.0.0.1:3000`. Open it (or your proxied domain) to land on `/admin/setup`, which creates the owner, shows a TOTP QR to scan, and issues recovery codes (save them). Set `BOOTSTRAP_TOKEN` before first boot to gate setup on a publicly reachable host.

## Reverse proxy (required for production)

The app binds to `127.0.0.1` only, so it is unreachable until you put a proxy in front. The proxy also provides the HTTPS that secure cookies require in production. Two `.env` settings make it proxy-aware:

- `ORIGIN`: the exact public URL (scheme + host), e.g. `https://events.example.com`. A mismatch causes `403` on form posts.
- `TRUST_PROXY=true`: trust `X-Forwarded-*` for client IP and protocol.

Behind Portainer + Nginx Proxy Manager + Cloudflare? See [docs/DEPLOY.md](docs/DEPLOY.md) for a ready-to-paste stack with the `XFF_DEPTH` and SSE notes worked out.

Caddy (automatic HTTPS):

```caddyfile
events.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name events.example.com;
    # ssl_certificate     /etc/letsencrypt/live/events.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/events.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

## Phone push

Get an OS notification when a guest RSVPs, edits, or withdraws. No native app needed.

- iOS (16.4+): open the admin panel in Safari, Share then Add to Home Screen (iOS delivers Web Push only to installed PWAs), open it from the home screen, tap Enable notifications.
- Android: open the admin panel in Chrome, tap Enable notifications.

Requires `VAPID_*` in `.env`. Enrolled devices appear under Admin > Account > Push devices.

### Webhook notifiers

Add under Admin > Settings > Webhook notifiers, instead of or alongside Web Push:

| Service | Format | URL |
|---|---|---|
| [ntfy](https://ntfy.sh) | `ntfy` | `https://ntfy.sh/your-topic` |
| [Gotify](https://gotify.net) | `json` | `https://gotify.example.net/message?token=<token>` |
| Telegram | `telegram` | `https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>` |
| Anything else | `json` | Your endpoint; receives a JSON POST per event |

Filter each notifier by event type (`rsvp.created`, `rsvp.updated`, `rsvp.withdrawn`) and scope it to one event. Webhooks to private or loopback addresses are blocked (SSRF guard); set `ALLOW_PRIVATE_WEBHOOKS=true` to allow LAN notifiers if you trust everyone with admin access.

## Creating an event

1. Admin > Events > New event (optionally from a template).
2. Configure title, markdown description, location, dates, timezone, theme, capacity, waitlist, plus-ones (optional kids split), the RSVP window, and whether email is required.
3. Sign-up list: name the contribution noun, add categories with targets (e.g. Mains 6, Sides 8, Desserts 5), choose which fields guests fill (category, serves, note), and toggle allergy collection.
4. Custom fields: build extra questions (text, number, select, and more) under the Fields tab.
5. Publish: the event goes live at `/e/<slug>`.
6. Share: the Share page gives the public link and a QR code. Optionally enable an unguessable `?t=` token.

Save any event as a template (Details > Save as template) to reuse its fields, categories, options, and theme.

## Guest experience

Guests open the link and RSVP with no login. The thanks page shows a private edit link and an add-to-calendar button (the calendar entry embeds that link). With SMTP configured, the link is also emailed and guests can self-serve a resend. Any admin can copy or regenerate a guest's edit link from the RSVP list.

## Backups, restore, upgrades

Backup:

```bash
docker compose exec db pg_dump -U app mosi > backup-$(date +%F).sql
```

Nightly cron (3 AM):

```cron
0 3 * * * cd /opt/mosi && docker compose exec -T db pg_dump -U app mosi > /backups/mosi-$(date +\%F).sql
```

Restore into a fresh database (after `docker compose down -v` then `docker compose up -d db`):

```bash
docker compose exec -T db psql -U app -d mosi < backup.sql
```

Upgrade:

```bash
git pull
docker compose build --pull
docker compose up -d
```

Migrations run automatically on boot.

### Email encryption at rest

Set `ENCRYPTION_KEY` (`openssl rand -hex 32`) and guest/admin emails are stored AES-256-GCM encrypted; a keyed HMAC stored alongside keeps the "resend my link" lookup working. The key lives in your environment, not the database, so back it up separately and never commit it. Losing it makes encrypted emails unrecoverable. New installs encrypt from first boot. For an existing install with plaintext rows, run the idempotent backfill once:

```bash
docker compose exec -e ENCRYPTION_KEY=<your-key> app pnpm db:encrypt-emails
```

## Environment reference

All configuration lives in `.env` (copied from `.env.example`).

| Variable | Required | Description |
|---|---|---|
| `DB_PASSWORD` | Yes | Postgres password; compose passes it to the `db` service and interpolates it into `DATABASE_URL`. `openssl rand -hex 16`. |
| `DATABASE_URL` | Yes | Connection string. Under compose the host is `db`: `postgres://app:${DB_PASSWORD}@db:5432/mosi`. |
| `SESSION_SECRET` | Yes | Session-cookie signing secret. `openssl rand -hex 32`. |
| `ORIGIN` | Yes | Public origin, e.g. `https://events.example.com`. Used for CSRF and redirects. |
| `NODE_ENV` | Yes | `production` for deployments. |
| `TRUST_PROXY` | Yes | `true` behind a reverse proxy so client IP and protocol come from `X-Forwarded-*`. |
| `ENCRYPTION_KEY` | Recommended | Encrypts emails at rest (AES-256-GCM). `openssl rand -hex 32`. Keep it stable; losing it makes encrypted emails unrecoverable. |
| `XFF_DEPTH` | No | Trusted proxy count in `X-Forwarded-For` for correct per-IP rate limiting (Cloudflare + NPM is `2`). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | No | Web Push keys (`npx web-push generate-vapid-keys`). Blank disables push. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Guest magic-link email. Leave `SMTP_HOST` unset to keep email off. |
| `BOOTSTRAP_TOKEN` | No | One-time token required to reach `/admin/setup` on a fresh deploy. |
| `RATE_LIMIT_RSVP` | No | Guest RSVP limit per IP, e.g. `30/min` or `100/hour`. |
| `RATE_LIMIT_LOGIN` | No | Login and 2FA limit per IP (default `10/min`). |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | No | Auto-create the first owner on boot, skipping the setup wizard. |
| `REQUIRE_TOTP` | No | `true` (default) forces 2FA enrollment; `false` makes it optional. |
| `ALLOW_PRIVATE_WEBHOOKS` | No | `true` allows webhooks to private/LAN addresses (SSRF guard off). |

## Troubleshooting

- Health and logs: `docker compose ps` (app should be "healthy"), `docker compose logs -f app`.
- `403` on every form submit: `ORIGIN` does not match the browser URL exactly (scheme + host, no trailing slash). Fix it, then `docker compose up -d`.
- Can't stay logged in: production cookies are `Secure`, so serve over HTTPS via your proxy. Plain `http://` on a non-localhost host drops the cookie.
- Lost your 2FA device: use a recovery code at the 2FA step, or have another owner reset it under Admin > Users.
- No iPhone push: iOS delivers Web Push only to an installed PWA. Add to Home Screen first, open it from there, then enable. Confirm `VAPID_*` are set.
- Enabling email or push later: add `SMTP_*` or `VAPID_*` to `.env` and `docker compose up -d`; the UI appears on restart.
- "connection refused" right after the first `up`: Postgres is still initializing. The app retries migrations for about 30 seconds. Check `docker compose logs app` and verify `DB_PASSWORD` and `DATABASE_URL` match.

## Development

Node 22+ and pnpm 9 (`corepack enable`).

```bash
pnpm install
cp docker-compose.override.example.yml docker-compose.override.yml   # publishes the DB port
cp .env.example .env                                                 # set DB_PASSWORD
docker compose up -d db
export DATABASE_URL=postgres://app:<DB_PASSWORD>@localhost:5432/mosi
pnpm db:migrate
pnpm dev
```

| Command | Does |
|---|---|
| `pnpm dev` | Vite dev server |
| `pnpm check` | svelte-check type checking |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | E2E tests (Playwright; needs `DATABASE_URL`) |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed a demo event (set `SEED_ADMIN_USERNAME` and `SEED_ADMIN_PASSWORD` to also create an owner) |

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Deploying

For a registry + Portainer + Nginx Proxy Manager + Cloudflare setup, see [docs/DEPLOY.md](docs/DEPLOY.md).

## Contributing and security

See [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) for local setup, and [docs/SECURITY.md](docs/SECURITY.md) to report a vulnerability.

## License

[GNU AGPL-3.0-or-later](LICENSE). Copyright (C) 2026 catagris.

This is strong copyleft: network use counts as distribution, so if you run a modified version as a service you must offer its users the corresponding source.
