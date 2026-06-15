# Security Policy

Mosi handles personal data (guest names and email addresses) and an
authenticated admin panel, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Instead, report
privately via GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
(the **Security → Report a vulnerability** tab on the repository), or contact the
maintainer directly.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- affected version / commit.

You'll get an acknowledgement as soon as possible, and we'll work with you on a
fix and coordinated disclosure.

## Operator responsibilities

Mosi is self-hosted, so some of the security posture is yours:

- **Terminate TLS** at a reverse proxy in front of the app and set `ORIGIN` to
  the exact public origin (`TRUST_PROXY=true` behind the proxy).
- **Set `SESSION_SECRET`** to a strong random value (`openssl rand -hex 32`).
- **Set `ENCRYPTION_KEY`** to encrypt guest/admin emails at rest, and store it
  outside the database (e.g. a Docker/host secret). Losing it makes encrypted
  emails unrecoverable.
- **Protect backups:** `pg_dump` output and volume snapshots contain personal
  data; encrypt and access-control them. Encrypting the underlying dataset/disk
  is a good complementary layer.
- **Keep webhook SSRF protection on** (`ALLOW_PRIVATE_WEBHOOKS=false`) unless you
  specifically need LAN notifier targets.

## What's built in

Passwords are hashed with argon2id; admin 2FA is TOTP with single-use recovery
codes; sessions are DB-backed, HttpOnly/SameSite cookies with rate-limited login;
CSRF origin checks and a strict CSP are enforced; outbound webhook URLs are
SSRF-guarded; and emails are encrypted at rest when `ENCRYPTION_KEY` is set.
