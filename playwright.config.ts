import { defineConfig } from '@playwright/test';

/**
 * E2E config. Requires a reachable Postgres:
 *  - locally:  docker run … -p 5433:5432 (see README dev section) - default below
 *  - CI:       service container on 5432 with DATABASE_URL provided via env
 * The global setup resets the schema and applies migrations before the run.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5433/mosi';
const PORT = 4173;

// Test-only VAPID keys so the Web Push subscribe path is exercised end-to-end.
const TEST_VAPID_PUBLIC =
	'BEokpiiV5a9QF4YcUoy6gLYuI6ae5RuygpUXrCbzpQb_i1e8mH-_LDlAEo5u7oIsNThBWvUHtr2ar4luZQ0B0oA';
const TEST_VAPID_PRIVATE = 'CbeLxkjUGHQTbby602q7Yi3izIM5eV3rWTCj9xa6bcg';

export default defineConfig({
	testDir: 'tests/e2e',
	globalSetup: './tests/e2e/global-setup.ts',
	fullyParallel: false,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	webServer: {
		command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: false,
		timeout: 240_000,
		env: {
			DATABASE_URL,
			SESSION_SECRET: 'e2e-secret-0123456789abcdef0123456789abcdef0123456789abcdef01234567',
			ORIGIN: `http://localhost:${PORT}`,
			NODE_ENV: 'test',
			VAPID_PUBLIC_KEY: TEST_VAPID_PUBLIC,
			VAPID_PRIVATE_KEY: TEST_VAPID_PRIVATE,
			VAPID_SUBJECT: 'mailto:e2e@example.com',
			// The suite logs in many times in quick succession.
			RATE_LIMIT_LOGIN: '300/min',
			// Pin the auth policy so a developer's local .env (which may enable the
			// env-admin/optional-2FA shortcuts) can't change the tested flow. These
			// keys are set here so dotenv won't override them from .env.
			REQUIRE_TOTP: 'true',
			ADMIN_PASSWORD: '',
			// Exercise the encrypted-email path end-to-end.
			ENCRYPTION_KEY: 'e2e0000000000000000000000000000000000000000000000000000000000001'
		}
	}
});
