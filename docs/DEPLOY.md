# Deploying with Portainer + Nginx Proxy Manager + Cloudflare

This walks through deploying Mosi from a private registry to a Portainer
stack, fronted by Nginx Proxy Manager (NPM) and Cloudflare. The example uses:

- Registry: `registry.example.com`
- Public URL: `https://events.example.com`

Substitute your own values.

## 1. Build & push the image

> **Architecture:** build for your **server's** CPU, not your laptop's. Apple
> Silicon (`arm64`) building for an `amd64` server produces an image that fails
> with `exec format error`. `buildx` cross-builds and pushes in one step.

```bash
docker login registry.example.com

# Most servers are amd64 (Intel/AMD). For an ARM server use linux/arm64.
docker buildx build \
  --platform linux/amd64 \
  -t registry.example.com/mosi:1.0.0 \
  -t registry.example.com/mosi:latest \
  --push .
```

(Portainer can also build from a Git repo, but pushing a pre-built image to your
registry is the path described here.)

## 2. Create the shared proxy network (once)

So NPM can reach the app container by name, both must share a Docker network:

```bash
docker network create proxy
```

Then attach your **Nginx Proxy Manager** container to that `proxy` network
(Portainer → Containers → your NPM container → Connect to network → `proxy`, or
add it to NPM's own compose). If your NPM already uses a shared network, reuse
that name instead and change it in the stack YAML below.

## 3. Create the Portainer stack

In Portainer: **Stacks → Add stack**, paste the stack below, then fill in the
**Environment variables**:

```yaml
# Production stack for Portainer (app + PostgreSQL).
#
# The app image is pulled from your registry; Nginx Proxy Manager terminates
# TLS and proxies to the `mosi-app` container over a shared Docker network.
# Set the variables below in Portainer's stack "Environment variables" editor.
#
# Required: IMAGE, ORIGIN, DB_PASSWORD, SESSION_SECRET, ENCRYPTION_KEY

services:
  app:
    image: ${IMAGE}:${TAG:-latest}
    container_name: mosi-app
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/mosi
      ORIGIN: ${ORIGIN} # e.g. https://events.example.com - must match the public URL exactly
      NODE_ENV: production
      TRUST_PROXY: "true"
      XFF_DEPTH: "${XFF_DEPTH:-2}" # Cloudflare + Nginx Proxy Manager = 2 proxies
      SESSION_SECRET: ${SESSION_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY} # encrypt emails at rest - keep this safe & stable
      # --- optional: phone push (npx web-push generate-vapid-keys) ---
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-mailto:admin@example.com}
      # --- optional: SMTP for guest magic-link emails ---
      SMTP_HOST: ${SMTP_HOST:-}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
      # Set a real sender when SMTP is enabled; blank falls back to an unusable
      # "Mosi <no-reply@localhost>" that most providers reject.
      SMTP_FROM: ${SMTP_FROM:-} # e.g. "Mosi <events@example.com>"
      # --- optional: first-run admin (skips the setup wizard) & 2FA policy ---
      ADMIN_USERNAME: ${ADMIN_USERNAME:-}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
      REQUIRE_TOTP: ${REQUIRE_TOTP:-true}
      # --- optional: ops levers ---
      BOOTSTRAP_TOKEN: ${BOOTSTRAP_TOKEN:-} # if set, the setup wizard requires this token
      RATE_LIMIT_RSVP: ${RATE_LIMIT_RSVP:-30/min} # guest RSVP submits per IP
      RATE_LIMIT_LOGIN: ${RATE_LIMIT_LOGIN:-10/min} # admin login + 2FA attempts per IP
      ALLOW_PRIVATE_WEBHOOKS: ${ALLOW_PRIVATE_WEBHOOKS:-false} # allow webhook targets on LAN/loopback
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
        ]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - proxy
      - internal
    # If NPM is NOT on a shared Docker network, comment out `networks: [proxy]`
    # above, uncomment below, and point NPM at <docker-host-ip>:3000.
    # ports:
    #   - "127.0.0.1:3000:3000"

  db:
    image: postgres:16-alpine
    container_name: mosi-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: mosi
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d mosi"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - internal

volumes:
  pgdata:

networks:
  # Shared with Nginx Proxy Manager. Create it once and attach your NPM
  # container to it:  docker network create proxy
  proxy:
    external: true
  internal:
    driver: bridge
```

| Variable | Value |
|---|---|
| `IMAGE` | `registry.example.com/mosi` |
| `TAG` | `1.0.0` (or `latest`) |
| `ORIGIN` | `https://events.example.com` |
| `DB_PASSWORD` | a strong random string (`openssl rand -hex 16`) |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | `openssl rand -hex 32`, encrypts emails at rest |
| `XFF_DEPTH` | `2` (Cloudflare + NPM). See note below. |
| `REQUIRE_TOTP` | `true` (recommended) or `false` |

Optional:

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Phone push (`npx web-push generate-vapid-keys`) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Guest magic-link emails |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Auto-create the owner on first boot (skips the setup wizard) |

Keep `ENCRYPTION_KEY` and `SESSION_SECRET` **safe and stable**: store them with
your other secrets, not in the Git repo. Losing `ENCRYPTION_KEY` makes encrypted
emails unrecoverable.

> **Webhook credentials are stored at rest in plaintext.** A webhook notifier's URL
> and secret (including a Telegram bot token embedded in its URL) live unencrypted in
> the `webhook_endpoints` table — unlike guest emails, they aren't covered by
> `ENCRYPTION_KEY`. Treat database dumps/backups as sensitive and restrict DB access.

Deploy the stack. The app runs migrations on boot, then serves on port 3000 (not
published to the host, only reachable over the `proxy` network).

## 4. Nginx Proxy Manager: proxy host

**Hosts → Proxy Hosts → Add Proxy Host**

- **Domain Names:** `events.example.com`
- **Scheme:** `http`
- **Forward Hostname / IP:** `mosi-app` (the container name)
- **Forward Port:** `3000`
- **Cache Assets:** off
- **Block Common Exploits:** on
- **Websockets Support:** on

> If you didn't put NPM on the shared `proxy` network, instead publish a host
> port in the compose (`127.0.0.1:3000:3000` won't be reachable from NPM-in-
> Docker, so use `3000:3000` or a bound LAN IP) and forward to `<docker-host-ip>:3000`.

**SSL tab:** request/attach a certificate (Let's Encrypt, or a Cloudflare Origin
Certificate if you run Cloudflare in Full (strict) mode), and enable **Force SSL**
and **HTTP/2**.

> **Don't expose `/healthz` publicly.** It's the container liveness probe and
> reports DB up/down (`200`/`503`) — useful internally, but no reason to serve it
> to the internet. The probe runs container-to-container; if you add path rules at
> NPM/Cloudflare, leave `/healthz` off the public host (or block it).

The admin panel uses Server-Sent Events for live RSVP alerts. The app already
sends `X-Accel-Buffering: no`, so NPM streams them without extra config, and a
25-second heartbeat keeps the connection open. If your setup buffers anyway, add
this to the proxy host's **Advanced** tab:

```nginx
proxy_set_header Connection '';
proxy_http_version 1.1;
proxy_buffering off;
proxy_read_timeout 1h;
```

(If SSE is ever blocked, the admin shell automatically falls back to 60-second
polling, and alerts still work.)

## 5. Cloudflare

- Point the `events` DNS record at your server / NPM, **proxied** (orange cloud).
- **SSL/TLS mode:** **Full (strict)** is best: install a Cloudflare Origin
  Certificate on the NPM proxy host. "Flexible" also works (the app sets secure
  cookies in production regardless) but is less secure end-to-end.
- No special cache rules needed: the app's responses are dynamic and aren't
  cached by default. SSE works through Cloudflare thanks to the heartbeat.

### About `XFF_DEPTH=2`

Per-IP rate limiting (login, RSVP, etc.) needs the **real visitor IP**. With
Cloudflare → NPM → app there are two proxies, so the client IP sits two entries
deep in `X-Forwarded-For`. `XFF_DEPTH=2` tells the app to read it correctly.
With the wrong value, every visitor can look like the same proxy IP and share one
rate-limit bucket. (Alternatively set `ADDRESS_HEADER=cf-connecting-ip` to read
Cloudflare's real-client header directly.)

## Enforced configuration (boot fails fast)

On startup Mosi validates its environment and refuses to boot (with a combined
error listing every problem) if any of these don't hold:

- `DATABASE_URL` is set and no longer contains the placeholder `change-me`.
- `SESSION_SECRET` is set and at least 32 characters (`openssl rand -hex 32`).
- `ENCRYPTION_KEY`, **when set**, is 32 bytes — 64 hex chars (`openssl rand -hex 32`)
  or a ≥32-character passphrase.
- In production (`NODE_ENV=production`), `ORIGIN` is set and uses `https://`.
- If `ORIGIN` is `https://`, `NODE_ENV` is `production` — otherwise session cookies
  would ship without the `Secure` flag behind TLS.
- When push is configured (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`), `VAPID_SUBJECT`
  is a real `mailto:`/`https:` contact, not the `mailto:admin@example.com` placeholder.

## 6. First run

Visit `https://events.example.com/admin`:

- If you set `ADMIN_PASSWORD`, sign in with it; otherwise you'll land on
  `/admin/setup` to create the owner.
- With `REQUIRE_TOTP=true` you'll scan a TOTP QR and save recovery codes.
- Then create an event, configure it, publish, and share `/e/<slug>`.

## Upgrades

Build & push a new tag, then in Portainer update the stack's `TAG` (or
re-pull `latest`) and redeploy - **Pull and redeploy**. Migrations run
automatically on boot.

> **Run a single app instance.** Migrations apply on boot without a distributed
> lock, so booting multiple replicas at once could race the schema DDL. Scale to
> one `app` container (the documented stack already does); if you ever need
> several, run migrations as a separate one-shot step before starting the fleet.

## Backups

```bash
docker exec mosi-db pg_dump -U app mosi > backup-$(date +%F).sql
```

Encrypt and store backups off-box; they contain personal data (emails are
encrypted at rest only if `ENCRYPTION_KEY` is set).

## Verifying webhook signatures (JSON notifiers)

When a JSON webhook notifier has a **secret** set, Mosi signs each outbound
request so your receiver can confirm it really came from Mosi and reject
replays. Two headers are added:

- `X-Mosi-Timestamp` - Unix time (seconds) when the request was built.
- `X-Mosi-Signature` - `sha256=<hex>` where `<hex>` is
  `HMAC-SHA256(secret, "<timestamp>.<raw-body>")`.

Verify on the receiver by recomputing the HMAC over `timestamp + "." + body`
using the **raw** request body (not a re-serialized copy), comparing in
constant time, and rejecting timestamps that are too old (e.g. > 5 minutes):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyMosi(rawBody, headers, secret) {
  const ts = headers['x-mosi-timestamp'];
  const sig = headers['x-mosi-signature'] || '';
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // stale/replay
  const expected = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

ntfy and Telegram notifiers are unaffected (they authenticate via their own
bearer token / bot token).
